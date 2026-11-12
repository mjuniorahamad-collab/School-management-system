// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { QuickActions } from "@/components/dashboard/QuickActions"

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: mocks.useAuth }))
vi.mock("@/components/teachers/TeacherFormDialog", () => ({ TeacherFormDialog: () => null }))
vi.mock("@/components/payments/PaymentFormDialog", () => ({ PaymentFormDialog: () => null }))
vi.mock("@/components/notices/NoticeFormDialog", () => ({ NoticeFormDialog: () => null }))

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

function renderQuickActions(user: AuthUser) {
  mocks.useAuth.mockReturnValue({
    can: (permission: string) => canUser(user, permission),
  })

  return render(
    <MemoryRouter>
      <QuickActions />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  mocks.useAuth.mockReset()
})

describe("QuickActions permissions", () => {
  it("renders nothing when no action is permitted", () => {
    renderQuickActions(makeUser())

    expect(screen.queryByText("Quick Actions")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("renders only the actions the user can perform", () => {
    renderQuickActions(makeUser({ permissions: ["students:create"] }))

    expect(screen.getByText("Quick Actions")).toBeTruthy()
    expect(screen.getByRole("button", { name: /add student/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /add teacher/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /mark attendance/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /collect fees/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /create notice/i })).toBeNull()
  })

  it("renders every action for SUPER_ADMIN", () => {
    renderQuickActions(makeUser({ roles: ["SUPER_ADMIN"], permissions: [] }))

    expect(screen.getByRole("button", { name: /add student/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /add teacher/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /mark attendance/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /collect fees/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /create notice/i })).toBeTruthy()
  })
})
