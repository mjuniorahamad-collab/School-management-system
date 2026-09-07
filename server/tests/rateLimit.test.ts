import express from "express"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { errorHandler } from "../src/middleware/errorHandler.js"
import { RATE_LIMITED, rateLimit } from "../src/middleware/rateLimit.js"

// The middleware keeps its window in a module-local store shared by every
// mount. Tests therefore give each scenario a distinct key so buckets never
// leak between them.
function buildApp(options: Parameters<typeof rateLimit>[0]) {
  const app = express()
  app.use(rateLimit(options))
  app.get("/probe", (_req, res) => res.json({ ok: true }))
  app.use(errorHandler)
  return app
}

describe("auth rate limiter", () => {
  it("allows requests within the limit, then 429s with retryAfterSeconds", async () => {
    const app = buildApp({ limit: 2, windowMs: 60_000, key: () => "enforce" })
    expect((await request(app).get("/probe")).status).toBe(200)
    expect((await request(app).get("/probe")).status).toBe(200)

    const limited = await request(app).get("/probe")
    expect(limited.status).toBe(429)
    expect(limited.body.success).toBe(false)
    expect(limited.body.error.code).toBe(RATE_LIMITED)
    expect(limited.body.error.message).toBeTruthy()
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThanOrEqual(1)

    // The bucket stays closed until the window rolls.
    expect((await request(app).get("/probe")).status).toBe(429)
  })

  it("resets the bucket once the window elapses", async () => {
    const app = buildApp({ limit: 1, windowMs: 60, key: () => "reset" })
    expect((await request(app).get("/probe")).status).toBe(200)
    expect((await request(app).get("/probe")).status).toBe(429)
    await new Promise((resolve) => setTimeout(resolve, 90))
    expect((await request(app).get("/probe")).status).toBe(200)
  })

  it("is a no-op when disabled", async () => {
    const app = buildApp({ limit: 2, windowMs: 60_000, key: () => "disabled", enabled: false })
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get("/probe")).status).toBe(200)
    }
  })

  it("keys buckets by the custom extractor (constant key = shared bucket)", async () => {
    const app = buildApp({ limit: 1, windowMs: 60_000, key: () => "same-client" })
    expect((await request(app).get("/probe")).status).toBe(200)
    expect((await request(app).get("/probe")).status).toBe(429)
  })

  it("keys buckets by the remote IP by default", async () => {
    const app = buildApp({ limit: 1, windowMs: 60_000 })
    expect((await request(app).get("/probe")).status).toBe(200)
    expect((await request(app).get("/probe")).status).toBe(429)
  })
})