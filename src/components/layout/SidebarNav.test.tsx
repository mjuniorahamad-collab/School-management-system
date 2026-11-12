// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { SidebarNav } from "@/components/layout/SidebarNav"
import { getAllNavItems, navigationSections } from "@/routes/navigation"

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

function renderSidebar(user: AuthUser) {
  mocks.useAuth.mockReturnValue({
    can: (permission: string) => canUser(user, permission),
  })

  return render(
    <MemoryRouter>
      <SidebarNav />
    </MemoryRouter>,
  )
}

describe("SidebarNav permissions", () => {
  afterEach(() => {
    cleanup()
    mocks.useAuth.mockReset()
  })

  it("requires every nav item to declare a permission", () => {
    for (const item of getAllNavItems()) {
      expect(item.requiredPermission.trim(), item.label).not.toBe("")
    }
  })

  it("hides a module when the user lacks its permission", () => {
    renderSidebar(makeUser({ permissions: ["dashboard:view", "students:view"] }))

    expect(screen.getByText("Students")).toBeTruthy()
    expect(screen.queryByText("Fees Management")).toBeNull()
    expect(screen.queryByText("Payments")).toBeNull()
  })

  it("does not render a section with no visible items", () => {
    renderSidebar(makeUser({ permissions: ["dashboard:view"] }))

    expect(screen.getByText("Overview")).toBeTruthy()
    expect(screen.queryByText("Academics")).toBeNull()
    expect(screen.queryByText("Finance")).toBeNull()
    expect(screen.queryByText("Services")).toBeNull()
    expect(screen.queryByText("Communication")).toBeNull()
    expect(screen.queryByText("Insights")).toBeNull()
    expect(screen.queryByText("System")).toBeNull()
  })

  it("shows every nav item and section for SUPER_ADMIN", () => {
    renderSidebar(makeUser({ roles: ["SUPER_ADMIN"], permissions: [] }))

    expect(screen.getAllByRole("link")).toHaveLength(getAllNavItems().length)

    for (const section of navigationSections) {
      expect(screen.getByText(section.label), section.label).toBeTruthy()
    }
  })
})
