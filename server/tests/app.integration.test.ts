import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"

const app = createApp()

describe("HTTP foundation and auth guards", () => {
  it("GET /api/v1/live returns the success envelope without database access", async () => {
    const res = await request(app).get("/api/v1/live")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("ok")
    expect(res.body.data).not.toHaveProperty("database")
  })

  it("GET /api/v1/health returns the success envelope", async () => {
    const res = await request(app).get("/api/v1/health")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("unknown API routes return the 404 envelope", async () => {
    const res = await request(app).get("/api/v1/definitely-not-a-route")
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } })
  })

  it("GET /api/v1/auth/me rejects unauthenticated requests with UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/v1/auth/me")
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe("UNAUTHORIZED")
  })

  it("POST /api/v1/auth/refresh rejects missing refresh cookies with UNAUTHORIZED", async () => {
    const res = await request(app).post("/api/v1/auth/refresh")
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe("UNAUTHORIZED")
  })

  it("POST /api/v1/auth/login validates the body before touching the database", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("allows credentialed CORS requests from the allowed dev origins", async () => {
    const res = await request(app)
      .options("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173")
  })
})