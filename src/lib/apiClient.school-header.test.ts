import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
import { api } from "./apiClient"
import { clearActiveSchoolId, setActiveSchoolId } from "@/auth/activeSchool"

const json = (data: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response

const originalFetch = globalThis.fetch

describe("apiClient active-school header", () => {
  let captured: { url: string; headers: Headers }[]

  const mockFetch = (): void => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string | URL | Request, init?: RequestInit) => {
        captured.push({ url: String(url), headers: new Headers(init?.headers) })
        return json({ data: { ok: true } })
      },
    )
  }

  beforeEach(() => {
    captured = []
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    clearActiveSchoolId()
  })

  it("sends X-School-Id on business requests when an active school is selected", async () => {
    setActiveSchoolId("school-b")
    mockFetch()

    await api.get("/students")

    expect(captured[0].headers.get("x-school-id")).toBe("school-b")
  })

  it("omits X-School-Id when no active school is selected", async () => {
    clearActiveSchoolId()
    mockFetch()

    await api.get("/students")

    expect(captured[0].headers.get("x-school-id")).toBeNull()
  })

  it("sends X-School-Id on login so a returning user lands on their last school", async () => {
    setActiveSchoolId("school-b")
    mockFetch()

    await api.post("/auth/login", { email: "a@school.test", password: "password-1234" })

    expect(captured[0].url.endsWith("/auth/login")).toBe(true)
    expect(captured[0].headers.get("x-school-id")).toBe("school-b")
  })

  it("keeps the current selection across retries after a session refresh", async () => {
    setActiveSchoolId("school-a")
    let hits = 0
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string | URL | Request, init?: RequestInit) => {
        hits++
        if (String(url).endsWith("/auth/refresh")) return json({ refreshed: true })
        if (hits === 1) return json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, false, 401)
        captured.push({ url: String(url), headers: new Headers(init?.headers) })
        return json({ data: { ok: true } })
      },
    )

    await api.get("/attendance")

    expect(captured).toHaveLength(1)
    expect(captured[0].headers.get("x-school-id")).toBe("school-a")
  })
})