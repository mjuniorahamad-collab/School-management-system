// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { GlobalSearch } from "@/components/layout/GlobalSearch"
import { getAllNavItems } from "@/routes/navigation"

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: mocks.useAuth }))
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }))

let queryEnabled: (boolean | undefined)[] = []

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

function renderSearch(user: AuthUser) {
  mocks.useAuth.mockReturnValue({
    can: (permission: string) => canUser(user, permission),
  })

  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>,
  )
}

function openSearch() {
  fireEvent.click(screen.getByLabelText("Open global search"))
}

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

beforeEach(() => {
  queryEnabled = []
  mocks.useAuth.mockReset()
  mocks.useQuery.mockReset()
  mocks.useQuery.mockImplementation((options: { enabled?: boolean }) => {
    queryEnabled.push(options.enabled)
    return {
      isPending: false,
      data: {
        items: [
          {
            id: "s-1",
            name: "Alice Student",
            admissionNumber: "ADM-1",
            class: { name: "Six", section: { name: "A" } },
          },
        ],
      },
    }
  })
})

afterEach(() => {
  cleanup()
})

describe("GlobalSearch permissions", () => {
  it("hides modules the user cannot access", () => {
    renderSearch(makeUser({ permissions: ["dashboard:view", "students:view"] }))
    openSearch()

    expect(screen.getByText("Dashboard")).toBeTruthy()
    expect(screen.queryByText("Fees Management")).toBeNull()
    expect(screen.queryByText("Payments")).toBeNull()
  })

  it("does not search or render students without students:view", () => {
    renderSearch(makeUser({ permissions: ["dashboard:view"] }))
    openSearch()

    expect(screen.queryByText("Alice Student")).toBeNull()
    expect(queryEnabled.some((enabled) => enabled === true)).toBe(false)
  })

  it("renders student results when students:view is effective", () => {
    renderSearch(makeUser({ permissions: ["dashboard:view", "students:view"] }))
    openSearch()

    expect(screen.getByText("Alice Student")).toBeTruthy()
    expect(queryEnabled.some((enabled) => enabled === true)).toBe(true)
  })

  it("shows every module for SUPER_ADMIN", () => {
    renderSearch(makeUser({ roles: ["SUPER_ADMIN"], permissions: [] }))
    openSearch()

    for (const item of getAllNavItems()) {
      expect(screen.getAllByText(item.label).length, item.label).toBeGreaterThan(0)
    }
  })
})
