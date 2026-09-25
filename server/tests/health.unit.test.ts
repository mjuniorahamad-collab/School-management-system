import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))

import { env } from "../src/config/env.js"
import { ApiError } from "../src/lib/ApiError.js"
import { getPrisma } from "../src/lib/database.js"
import { getHealth, getLiveness, getReadiness } from "../src/services/health.service.js"

const mockGetPrisma = vi.mocked(getPrisma)

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function mockSuccessfulQuery() {
  const query = vi.fn(async () => [{ "?column?": 1 }])
  mockGetPrisma.mockResolvedValue({ $queryRaw: query } as never)
  return query
}

function mockPendingQuery(): {
  query: ReturnType<typeof vi.fn>
  resolve: (value: unknown[]) => void
} {
  let resolveQuery: (value: unknown[]) => void = () => undefined
  const queryPromise = new Promise<unknown[]>((resolve) => {
    resolveQuery = resolve
  })
  const query = vi.fn(() => queryPromise)
  mockGetPrisma.mockResolvedValue({ $queryRaw: query } as never)
  return { query, resolve: resolveQuery }
}

describe("health service", () => {
  beforeEach(() => {
    mockGetPrisma.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns liveness without accessing the database", () => {
    const liveness = getLiveness()

    expect(liveness).toMatchObject({ status: "ok", version: "v1" })
    expect(liveness).not.toHaveProperty("database")
    expect(mockGetPrisma).not.toHaveBeenCalled()
  })

  it("reports readiness when the database ping answers", async () => {
    const query = mockSuccessfulQuery()
    const readiness = await getReadiness()

    expect(readiness).toMatchObject({ status: "ok", database: "ok", version: "v1" })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("returns service unavailable when no database is configured", async () => {
    mockGetPrisma.mockResolvedValue(null as never)

    await expect(getReadiness()).rejects.toBeInstanceOf(ApiError)
    await expect(getReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "Service is not ready",
    })
  })

  it("redacts database failures from readiness errors", async () => {
    mockGetPrisma.mockRejectedValue(new Error("postgresql://user:password@db.internal:5432/app"))

    await expect(getReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "Service is not ready",
    })
  })

  it("bounds a stalled database probe", async () => {
    vi.useFakeTimers()
    const { query, resolve } = mockPendingQuery()
    const readiness = getReadiness()
    const readinessAssertion = expect(readiness).rejects.toMatchObject({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(query).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(env.health.readinessTimeoutMs)
    await readinessAssertion
    resolve([{ "?column?": 1 }])
  })

  it("bounds a stalled Prisma client initialization", async () => {
    vi.useFakeTimers()
    mockGetPrisma.mockReturnValue(new Promise<never>(() => undefined) as never)
    const readiness = getReadiness()
    const readinessAssertion = expect(readiness).rejects.toMatchObject({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
    })

    await vi.advanceTimersByTimeAsync(env.health.readinessTimeoutMs)
    await readinessAssertion
  })

  it("coalesces concurrent readiness probes", async () => {
    const { query, resolve } = mockPendingQuery()
    const first = getReadiness()
    const second = getReadiness()

    await flushAsyncWork()
    expect(mockGetPrisma).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(1)

    resolve([{ "?column?": 1 }])
    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult.database).toBe("ok")
    expect(secondResult.database).toBe("ok")
  })

  it("coalesces legacy and readiness probes", async () => {
    const { query, resolve } = mockPendingQuery()
    const legacy = getHealth()
    const readiness = getReadiness()

    await flushAsyncWork()
    expect(mockGetPrisma).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(1)

    resolve([{ "?column?": 1 }])
    const [legacyResult, readinessResult] = await Promise.all([legacy, readiness])
    expect(legacyResult.database).toBe("ok")
    expect(readinessResult.database).toBe("ok")
  })

  it("allows a new probe after the shared probe completes", async () => {
    mockSuccessfulQuery()

    await getReadiness()
    await getReadiness()

    expect(mockGetPrisma).toHaveBeenCalledTimes(2)
  })

  it("keeps the legacy health payload on database failure", async () => {
    mockGetPrisma.mockRejectedValue(new Error("connection refused: 127.0.0.1:secret"))
    const health = await getHealth()

    expect(health.database).toBe("unreachable")
    expect(health.status).toBe("ok")
    expect(JSON.stringify(health)).not.toContain("secret")
  })

  it("keeps legacy metadata stable", async () => {
    const health = await getHealth()

    expect(health.version).toBe("v1")
    expect(typeof health.uptime).toBe("number")
    expect(Number.isNaN(new Date(health.timestamp).getTime())).toBe(false)
  })
})
