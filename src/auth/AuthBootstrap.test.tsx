// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AuthProvider } from "@/auth/AuthContext"
import { useAuth } from "@/auth/useAuth"
import { clearActiveSchoolId } from "@/auth/activeSchool"
import { ME_QUERY_KEY } from "@/auth/context"
import { api } from "@/lib/apiClient"
import LoginPage from "@/pages/LoginPage"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import type { AuthUser } from "@/auth/types"

const json = (data: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response

const unauthorized = () =>
  json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, false, 401)

const USER: AuthUser = {
  id: "user-1",
  school: { id: "school-a", name: "Bright Future" },
  name: "Ada Admin",
  email: "ada@school.test",
  status: "ACTIVE",
  roles: ["SUPER_ADMIN"],
  permissions: ["dashboard:view"],
  memberships: [{ id: "school-a", name: "Bright Future", role: "SUPER_ADMIN" }],
}

const originalFetch = globalThis.fetch

/** Mirrors the QueryClient defaults in src/app/App.tsx. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
    },
  })
}

const authState = () => screen.getByTestId("auth-state").textContent

const signOutButton = () => screen.getByRole("button", { name: /^sign out$/i })

const signInButton = async () =>
  (await screen.findByRole("button", { name: /^sign in$/i })) as HTMLButtonElement

/**
 * Surfaces the live auth context in the DOM so tests assert what the UI sees:
 * `ready:anonymous` is exactly `isLoading === false && user === null`.
 */
function AuthProbe() {
  const { user, isLoading, isError, signOut } = useAuth()
  return (
    <div>
      <div data-testid="auth-state">
        {isLoading ? "loading" : "ready"}:{user ? user.email : "anonymous"}
        {isError ? ":error" : ""}
      </div>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}

/** Real AuthProvider/LoginPage/ProtectedRoute; only the route table is test-local. */
function renderApp(initialPath: string) {
  const queryClient = createQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <AuthProbe />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>app shell</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return queryClient
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init),
  )
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

/** No session at all: /auth/me 401s and the refresh cookie is rejected too. */
function mockSignedOut(): void {
  mockFetch(() => unauthorized())
}

/** Session that refreshes successfully on the second attempt. */
function mockRefreshableSession(): void {
  let meHits = 0
  mockFetch((url) => {
    if (url.endsWith("/auth/refresh")) return json({ refreshed: true })
    meHits++
    if (meHits === 1) return unauthorized()
    return json({ data: { user: USER } })
  })
}

describe("auth bootstrap", () => {
  beforeEach(() => {
    clearActiveSchoolId()
  })

  afterEach(() => {
    cleanup()
    globalThis.fetch = originalFetch
    clearActiveSchoolId()
  })

  it("makes /login interactive when /auth/me and /auth/refresh both return 401", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/login")) return json({ data: { user: USER } })
      return unauthorized()
    })

    renderApp("/login")

    const button = await signInButton()
    await waitFor(() => expect(button.disabled).toBe(false))
    expect(button.disabled).toBe(false)
    expect(authState()).toBe("ready:anonymous")

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@school.test" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password-1234" } })
    fireEvent.click(button)

    // The click really submitted: login ran and the app moved past /login.
    await screen.findByText("app shell")
    expect(screen.queryByTestId("auth-state")?.textContent).toBe("ready:ada@school.test")
  })

  it("redirects a protected route to /login instead of hanging on the loading screen", async () => {
    mockSignedOut()

    renderApp("/dashboard")

    await screen.findByRole("button", { name: /^sign in$/i })
    expect(screen.queryByText(/loading your session/i)).toBeNull()
    expect(authState()).toBe("ready:anonymous")
  })

  it("exposes user === null and isLoading === false once the bootstrap settles", async () => {
    mockSignedOut()

    renderApp("/login")

    await waitFor(() => expect(authState()).toBe("ready:anonymous"))
    expect(authState()).not.toContain("error")
  })

  it("still signs an authenticated user into the app shell", async () => {
    mockRefreshableSession()

    renderApp("/dashboard")

    await screen.findByText("app shell")
    await waitFor(() => expect(authState()).toBe("ready:ada@school.test"))
    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull()
  })

  it("signs out to /login and purges tenant data when a refresh is rejected mid-session", async () => {
    let revoked = false
    mockFetch((url) => {
      if (revoked) return unauthorized()
      if (url.endsWith("/auth/me")) return json({ data: { user: USER } })
      return json({ data: [{ id: "s1" }] })
    })

    const queryClient = renderApp("/dashboard")
    await screen.findByText("app shell")
    queryClient.setQueryData(["students", "list"], [{ id: "s1" }])
    queryClient.setQueryData(ME_QUERY_KEY, { user: USER })

    // A live request 401s and the refresh token is rejected: forced sign-out.
    revoked = true
    await expect(api.get("/students")).rejects.toThrow()

    await screen.findByRole("button", { name: /^sign in$/i })
    expect(queryClient.getQueryData(["students", "list"])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ user: null })
    expect(authState()).toBe("ready:anonymous")
  })

  it("clears tenant caches on an explicit logout", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) return json({ data: { user: USER } })
      if (url.endsWith("/auth/logout")) return json({ data: { success: true } })
      return json({ data: [] })
    })

    const queryClient = renderApp("/dashboard")
    await screen.findByText("app shell")
    queryClient.setQueryData(["students", "list"], [{ id: "s1" }])

    await act(async () => {
      fireEvent.click(signOutButton())
    })

    await screen.findByRole("button", { name: /^sign in$/i })
    expect(queryClient.getQueryData(["students", "list"])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ user: null })
    expect(authState()).toBe("ready:anonymous")
  })
})
