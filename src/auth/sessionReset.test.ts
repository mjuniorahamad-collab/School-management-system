import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { ApiClientError, api, onSignedOut } from "@/lib/apiClient"
import { clearActiveSchoolId, getActiveSchoolId, setActiveSchoolId } from "@/auth/activeSchool"
import { ME_QUERY_KEY } from "@/auth/context"
import { isAuthQueryKey, resetSessionState } from "@/auth/sessionReset"
import { fetchMe } from "@/services/authService"
import type { AuthUser } from "@/auth/types"

const json = (data: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response

const unauthorized = () => json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, false, 401)

const originalFetch = globalThis.fetch

const SIGNED_IN_USER: AuthUser = {
  id: "user-1",
  school: { id: "school-a", name: "Bright Future" },
  name: "Ada Admin",
  email: "ada@school.test",
  status: "ACTIVE",
  roles: ["SUPER_ADMIN"],
  permissions: ["dashboard:view"],
  memberships: [{ id: "school-a", name: "Bright Future", role: "SUPER_ADMIN" }],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Polls until `check` returns true so assertions never race the microtask queue. */
async function waitFor(check: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

// Mirrors the ME queryFn in AuthContext.tsx (options included): a 401/403 means
// "not signed in", anything else is a real error.
const meQueryFn = async (): Promise<{ user: AuthUser | null }> => {
  try {
    const { user } = await fetchMe()
    return { user }
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
      return { user: null }
    }
    throw error
  }
}

const ME_OBSERVER_OPTIONS = {
  queryKey: ME_QUERY_KEY,
  retry: false,
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
} as const

/**
 * Drives the real React Query lifecycle the AuthProvider relies on: a live
 * QueryClient, an observer subscribed to the ME query, and the real
 * `onSignedOut` -> `resetSessionState` wiring.
 */
function mountMeObserver(queryClient: QueryClient, queryFn = meQueryFn) {
  const observer = new QueryObserver(queryClient, { ...ME_OBSERVER_OPTIONS, queryFn })
  const states: { isLoading: boolean; isError: boolean; data: unknown }[] = []
  const unsubscribe = observer.subscribe((result) => {
    states.push({ isLoading: result.isLoading, isError: result.isError, data: result.data })
  })
  return { observer, states, unsubscribe }
}

describe("resetSessionState", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
    clearActiveSchoolId()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    clearActiveSchoolId()
  })

  // ── Forced sign-out during the bootstrap ME fetch (the production bug) ──────

  it("settles an in-flight ME fetch as signed out instead of loading forever", async () => {
    const queryClient = new QueryClient()
    const meResponse = deferred<Response>()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) return unauthorized()
      return meResponse.promise
    })

    const { observer, unsubscribe } = mountMeObserver(queryClient)
    await waitFor(() => observer.getCurrentResult().isLoading, "ME fetch to start")

    // The revoked refresh emits while the ME query is still fetching: that is
    // the exact production ordering.
    let fetchStatusAtSignOut: string | null = null
    const unsubscribeSignedOut = onSignedOut(() => {
      fetchStatusAtSignOut = observer.getCurrentQuery().state.fetchStatus
      resetSessionState(queryClient)
    })
    meResponse.resolve(unauthorized())

    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth loading to end")
    expect(fetchStatusAtSignOut).toBe("fetching")

    const result = observer.getCurrentResult()
    expect(result.isLoading).toBe(false)
    expect(result.status).toBe("success")
    expect(result.data).toEqual({ user: null })
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ user: null })

    unsubscribeSignedOut()
    unsubscribe()
  })

  it("keeps the AuthProvider's observer attached to the live ME query", async () => {
    const queryClient = new QueryClient()
    const meResponse = deferred<Response>()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) return unauthorized()
      return meResponse.promise
    })

    const { observer, unsubscribe } = mountMeObserver(queryClient)
    await waitFor(() => observer.getCurrentResult().isLoading, "ME fetch to start")

    const unsubscribeSignedOut = onSignedOut(() => resetSessionState(queryClient))
    meResponse.resolve(unauthorized())
    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth loading to end")

    // The observer must still be attached to the query the cache holds, and the
    // auth namespace must never be removed out from under it.
    expect(observer.getCurrentQuery().getObserversCount()).toBe(1)
    expect(queryClient.getQueryCache().find({ queryKey: ME_QUERY_KEY })).toBe(observer.getCurrentQuery())

    unsubscribeSignedOut()
    unsubscribe()
  })

  it("never observes a permanently loading state after a forced sign-out", async () => {
    const queryClient = new QueryClient()
    const meResponse = deferred<Response>()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) return unauthorized()
      return meResponse.promise
    })

    const { observer, states, unsubscribe } = mountMeObserver(queryClient)
    await waitFor(() => observer.getCurrentResult().isLoading, "ME fetch to start")

    const unsubscribeSignedOut = onSignedOut(() => resetSessionState(queryClient))
    meResponse.resolve(unauthorized())
    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth loading to end")

    // Loading may start, but the last state the provider ever sees is settled.
    expect(states.at(-1)).toEqual({ isLoading: false, isError: false, data: { user: null } })

    unsubscribeSignedOut()
    unsubscribe()
  })

  it("stays settled even when the ME query function fails with a non-401 error", async () => {
    const queryClient = new QueryClient()
    const gate = deferred<void>()
    const { observer, unsubscribe } = mountMeObserver(queryClient, async () => {
      await gate.promise
      throw new Error("network down")
    })
    await waitFor(() => observer.getCurrentResult().isLoading, "ME fetch to start")

    // The sign-out lands mid-flight, then the pending request fails hard.
    resetSessionState(queryClient)
    gate.resolve()
    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth loading to end")

    const result = observer.getCurrentResult()
    expect(result.isLoading).toBe(false)
    expect(result.data).toEqual({ user: null })

    unsubscribe()
  })

  it("is idempotent when concurrent 401s each trigger a sign-out", async () => {
    const queryClient = new QueryClient()
    const meResponse = deferred<Response>()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) return unauthorized()
      return meResponse.promise
    })

    const { observer, unsubscribe } = mountMeObserver(queryClient)
    await waitFor(() => observer.getCurrentResult().isLoading, "ME fetch to start")

    let signOuts = 0
    const unsubscribeSignedOut = onSignedOut(() => {
      signOuts++
      resetSessionState(queryClient)
    })
    meResponse.resolve(unauthorized())
    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth loading to end")

    // A late second emission (another in-flight request also 401ing) must not
    // resurrect loading or drop the deterministic auth state.
    resetSessionState(queryClient)
    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth loading to end")
    expect(signOuts).toBe(1)
    expect(observer.getCurrentResult().data).toEqual({ user: null })

    unsubscribeSignedOut()
    unsubscribe()
  })

  // ── Tenant hygiene ────────────────────────────────────────────────────────

  it("drops every tenant-scoped cache and keeps auth-namespaced keys", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["students", "list"], [{ id: "s1" }])
    queryClient.setQueryData(["dashboard", "summary"], { students: 10 })
    queryClient.setQueryData(ME_QUERY_KEY, { user: SIGNED_IN_USER })
    setActiveSchoolId("school-a")

    resetSessionState(queryClient)

    expect(queryClient.getQueryData(["students", "list"])).toBeUndefined()
    expect(queryClient.getQueryData(["dashboard", "summary"])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ user: null })
    expect(queryClient.getQueryCache().find({ queryKey: ME_QUERY_KEY })).toBeDefined()
  })

  it("clears the active school so the next request carries no tenant header", async () => {
    const queryClient = new QueryClient()
    setActiveSchoolId("school-a")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => json({ data: { ok: true } }))

    resetSessionState(queryClient)
    await api.get("/students")

    expect(getActiveSchoolId()).toBeNull()
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(new Headers(init?.headers).get("x-school-id")).toBeNull()
  })

  it("classifies only the auth namespace as identity-scoped", () => {
    expect(isAuthQueryKey(ME_QUERY_KEY)).toBe(true)
    expect(isAuthQueryKey(["students", "list"])).toBe(false)
  })

  // ── Explicit logout keeps clearing caches ─────────────────────────────────

  it("clears tenant caches and the session after an explicit logout", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["students", "list"], [{ id: "s1" }])
    queryClient.setQueryData(ME_QUERY_KEY, { user: SIGNED_IN_USER })
    setActiveSchoolId("school-a")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => json({ success: true }))

    await api.post("/auth/logout", {})
    resetSessionState(queryClient)

    expect(queryClient.getQueryData(["students", "list"])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ user: null })
    expect(getActiveSchoolId()).toBeNull()
  })

  it("clears local auth state even when logout cannot reach the server", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["students", "list"], [{ id: "s1" }])
    queryClient.setQueryData(ME_QUERY_KEY, { user: SIGNED_IN_USER })
    setActiveSchoolId("school-a")
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new Error("offline")
    })

    await expect(api.post("/auth/logout", {})).rejects.toThrow()
    resetSessionState(queryClient)

    expect(queryClient.getQueryData(["students", "list"])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ user: null })
    expect(getActiveSchoolId()).toBeNull()
  })

  // ── Refresh flow ──────────────────────────────────────────────────────────

  it("single-flights concurrent 401s and converges on one signed-out state", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["students", "list"], [{ id: "s1" }])
    queryClient.setQueryData(ME_QUERY_KEY, { user: SIGNED_IN_USER })
    setActiveSchoolId("school-a")

    let refreshHits = 0
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshHits++
        await new Promise((r) => setTimeout(r, 20))
        return unauthorized()
      }
      return unauthorized()
    })

    let signOuts = 0
    const unsubscribe = onSignedOut(() => {
      signOuts++
      resetSessionState(queryClient)
    })

    const results = await Promise.allSettled([api.get("/students"), api.get("/dashboard")])
    expect(results.every((r) => r.status === "rejected")).toBe(true)
    expect(refreshHits).toBe(1)
    expect(signOuts).toBe(2)
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ user: null })
    expect(queryClient.getQueryData(["students", "list"])).toBeUndefined()
    expect(getActiveSchoolId()).toBeNull()

    unsubscribe()
  })

  it("keeps the session when a 401 is followed by a successful refresh", async () => {
    const queryClient = new QueryClient()
    let meHits = 0
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) return json({ refreshed: true })
      meHits++
      if (meHits === 1) return unauthorized()
      return json({ data: { user: SIGNED_IN_USER } })
    })

    let signOuts = 0
    const unsubscribe = onSignedOut(() => {
      signOuts++
    })

    const { observer, unsubscribe: unsubscribeObserver } = mountMeObserver(queryClient)
    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth to settle")

    expect(signOuts).toBe(0)
    expect(meHits).toBe(2)
    expect(observer.getCurrentResult().data).toEqual({ user: SIGNED_IN_USER })
    expect(observer.getCurrentResult().isLoading).toBe(false)

    unsubscribe()
    unsubscribeObserver()
  })

  it("leaves a signed-in identity untouched", async () => {
    const queryClient = new QueryClient()
    const meResponse = deferred<Response>()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => meResponse.promise)

    const { observer, unsubscribe } = mountMeObserver(queryClient)
    await waitFor(() => observer.getCurrentResult().isLoading, "ME fetch to start")
    meResponse.resolve(json({ data: { user: SIGNED_IN_USER } }))
    await waitFor(() => observer.getCurrentResult().isLoading === false, "auth to settle")

    expect(observer.getCurrentResult().data).toEqual({ user: SIGNED_IN_USER })
    expect(observer.getCurrentResult().isLoading).toBe(false)

    unsubscribe()
  })

  // ── Root-cause characterization ───────────────────────────────────────────

  it("documents why the ME query must not be cleared mid-fetch", async () => {
    // Characterization of the original defect: removing the query the observer
    // is bound to silently cancels its fetch and strands it in isLoading. If
    // this ever flips, React Query fixed it upstream and this guard can go.
    const queryClient = new QueryClient()
    const gate = deferred<void>()
    const { observer, unsubscribe } = mountMeObserver(queryClient, async () => {
      await gate.promise
      return { user: null }
    })
    await waitFor(() => observer.getCurrentResult().isLoading, "ME fetch to start")

    queryClient.clear()
    queryClient.setQueryData(ME_QUERY_KEY, { user: null })
    gate.resolve()
    await new Promise((r) => setTimeout(r, 20))

    const result = observer.getCurrentResult()
    expect(result.isLoading).toBe(true)
    expect(result.data).toBeUndefined()
    expect(observer.getCurrentQuery().getObserversCount()).toBe(1)

    unsubscribe()
  })
})
