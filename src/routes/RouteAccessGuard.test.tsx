// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { AuthUser } from "@/auth/types"
import { RouteAccessGuard } from "@/routes/RouteAccessGuard"

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: mocks.useAuth }))

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u-1",
    name: "Test User",
    email: "user@example.com",
    status: "ACTIVE",
    school: { id: "s-1", name: "Test School" },
    roles: ["TEACHER"],
    permissions: [],
    memberships: [],
    ...overrides,
  }
}

function renderGuard(path: string, user: AuthUser, content = "Protected page") {
  mocks.useAuth.mockReturnValue({ user })

  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteAccessGuard>
        <div>{content}</div>
      </RouteAccessGuard>
    </MemoryRouter>,
  )
}

describe("RouteAccessGuard", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders the page when the user holds the required permission", () => {
    renderGuard("/students/student-1", makeUser({ permissions: ["students:view"] }))

    expect(screen.getByText("Protected page")).toBeTruthy()
    expect(screen.queryByText("Access denied")).toBeNull()
  })

  it("renders Access Denied instead of the page when the permission is missing", () => {
    renderGuard("/students/new", makeUser({ permissions: ["dashboard:view", "students:view"] }))

    expect(screen.queryByText("Protected page")).toBeNull()
    expect(screen.getByText("Access denied")).toBeTruthy()
    expect(screen.getByRole("link", { name: /back to home/i }).getAttribute("href")).toBe(
      "/dashboard",
    )
  })

  it("does not redirect to a denied landing page", () => {
    renderGuard("/fees", makeUser({ permissions: ["students:view"] }))

    expect(screen.getByText("Access denied")).toBeTruthy()
    expect(screen.getByText(/no accessible landing page/i)).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("links portal-only users back to the portal landing page", () => {
    renderGuard("/students", makeUser({ roles: ["PARENT"], permissions: ["portal:view"] }))

    expect(screen.getByText("Access denied")).toBeTruthy()
    expect(screen.getByRole("link", { name: /back to home/i }).getAttribute("href")).toBe("/portal")
  })

  it("passes root and unknown paths through to the route tree", () => {
    renderGuard("/", makeUser(), "Landing redirect")
    expect(screen.getByText("Landing redirect")).toBeTruthy()
    expect(screen.queryByText("Access denied")).toBeNull()

    cleanup()
    renderGuard("/not-a-route", makeUser(), "Not found")
    expect(screen.getByText("Not found")).toBeTruthy()
    expect(screen.queryByText("Access denied")).toBeNull()
  })
})
