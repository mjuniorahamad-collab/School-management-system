import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

describe.skipIf(!TEST_DATABASE_URL)("Health (integration)", () => {
  it("serves liveness without authentication or tenant context", async () => {
    const res = await request(app).get("/api/v1/live")

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("ok")
    expect(res.body.data.version).toBe("v1")
    expect(res.body.data).not.toHaveProperty("database")
    expect(res.headers["cache-control"]).toBe("no-store")
  })

  it("reports database readiness on the ready endpoint", async () => {
    const res = await request(app).get("/api/v1/ready")

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("ok")
    expect(res.body.data.database).toBe("ok")
    expect(res.body.data.version).toBe("v1")
    expect(res.body.data.env).toBe("test")
    expect(JSON.stringify(res.body)).not.toMatch(/localhost|127\.0\.0\.1|5432|postgres|postgresql/i)
  })

  it("keeps the legacy health endpoint compatible", async () => {
    const res = await request(app).get("/api/v1/health")

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("ok")
    expect(res.body.data.database).toBe("ok")
    expect(res.body.data.version).toBe("v1")
    expect(res.body.data.env).toBe("test")
    expect(JSON.stringify(res.body)).not.toMatch(/localhost|127\.0\.0\.1|5432|postgres|postgresql/i)
  })
})
