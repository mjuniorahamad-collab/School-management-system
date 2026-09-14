import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { api, onSignedOut } from "./apiClient"

const json = (data: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response

const err = (status: number, body: unknown) => json({ error: body }, false, status)

const originalFetch = globalThis.fetch

describe("apiClient 401 refresh flow", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("retries after a single refresh on a business-path 401", async () => {
    let businessHits = 0
    let refreshHits = 0
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshHits++
        return json({ refreshed: true })
      }
      businessHits++
      if (businessHits === 1) return err(401, { message: "Authentication required", code: "UNAUTHORIZED" })
      return json({ data: { ok: true } })
    })

    const result = await api.get("/students")
    expect(result).toEqual({ ok: true })
    expect(businessHits).toBe(2) // first 401 + retry
    expect(refreshHits).toBe(1)
  })

  it("does not attempt refresh for /auth/* paths", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () =>
      err(401, { message: "Invalid refresh token", code: "UNAUTHORIZED" }),
    )

    await expect(api.post("/auth/login", { email: "a@b.com", password: "12345678" })).rejects.toThrow()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1) // only the original call
  })

  it("emits onSignedOut and throws when refresh token is revoked (server 401)", async () => {
    let signedOuts = 0
    const unsub = onSignedOut(() => {
      signedOuts++
    })

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh"))
        return err(401, { message: "Missing refresh token", code: "UNAUTHORIZED" })
      return err(401, { message: "Authentication required", code: "UNAUTHORIZED" })
    })

    await expect(api.get("/students")).rejects.toThrow()
    expect(signedOuts).toBe(1)
    unsub()
  })

  it("does not emit signed-out on a network failure during refresh", async () => {
    let signedOuts = 0
    const unsub = onSignedOut(() => {
      signedOuts++
    })

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) throw new Error("fetch failed")
      return err(401, { message: "Authentication required", code: "UNAUTHORIZED" })
    })

    await expect(api.get("/students")).rejects.toThrow()
    expect(signedOuts).toBe(0)
    unsub()
  })

  it("single-flights concurrent 401s", async () => {
    let refreshHits = 0
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshHits++
        await new Promise((r) => setTimeout(r, 20))
        return json({ refreshed: true })
      }
      // Any business call after the refresh succeeded is fine to serve.
      return refreshHits > 0 ? json({ data: { ok: true } }) : err(401, { message: "Authentication required" })
    })

    const [r1, r2] = await Promise.all([api.get("/a"), api.get("/b")])
    expect(r1).toEqual({ ok: true })
    expect(r2).toEqual({ ok: true })
    expect(refreshHits).toBe(1)
  })
})