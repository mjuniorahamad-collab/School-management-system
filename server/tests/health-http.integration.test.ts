import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))

import { createApp } from "../src/app.js"
import { getPrisma } from "../src/lib/database.js"

const mockGetPrisma = vi.mocked(getPrisma)
const app = createApp()

describe("Health HTTP failure handling", () => {
  beforeEach(() => {
    mockGetPrisma.mockReset()
  })

  it("returns a generic 503 when readiness is unavailable", async () => {
    mockGetPrisma.mockResolvedValue(null as never)

    const res = await request(app).get("/api/v1/ready")

    expect(res.status).toBe(503)
    expect(res.body).toEqual({
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service is not ready",
      },
    })
    expect(res.headers["cache-control"]).toBe("no-store")
  })
})
