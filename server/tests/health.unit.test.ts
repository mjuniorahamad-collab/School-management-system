import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { getHealth } from "../src/services/health.service.js"

const mockGetPrisma = vi.mocked(getPrisma)

describe("health service — database readiness field", () => {
  beforeEach(() => {
    mockGetPrisma.mockReset()
  })

  it("reports database ok when the ping answers", async () => {
    mockGetPrisma.mockResolvedValue({ $queryRaw: async () => [{ "?column?": 1 }] } as never)
    const health = await getHealth()
    expect(health.database).toBe("ok")
  })

  it("reports unreachable when no database is configured", async () => {
    mockGetPrisma.mockResolvedValue(null as never)
    const health = await getHealth()
    expect(health.database).toBe("unreachable")
  })

  it("reports unreachable when the ping throws, without leaking internals", async () => {
    mockGetPrisma.mockRejectedValue(new Error("connection refused: 127.0.0.1:secret"))
    const health = await getHealth()
    expect(health.database).toBe("unreachable")
    expect(JSON.stringify(health)).not.toContain("secret")
  })

  it("always reports status ok regardless of database state (liveness)", async () => {
    mockGetPrisma.mockRejectedValue(new Error("down"))
    const health = await getHealth()
    expect(health.status).toBe("ok")
    expect(health.version).toBe("v1")
    expect(typeof health.uptime).toBe("number")
    expect(Number.isNaN(new Date(health.timestamp).getTime())).toBe(false)
  })
})