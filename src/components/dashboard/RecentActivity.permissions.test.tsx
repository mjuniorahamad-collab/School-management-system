// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { RecentActivity } from "@/components/dashboard/RecentActivity"
import type { DashboardActivity } from "@/types/dashboard"

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useRecentActivities: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: mocks.useAuth }))
vi.mock("@/hooks/useDashboardData", () => ({
  useRecentActivities: mocks.useRecentActivities,
}))

const activities: DashboardActivity[] = [
  {
    id: "student-s-1",
    action: "New student admission",
    entity: "Ada Lovelace",
    timestamp: new Date().toISOString(),
    tone: "success",
    source: "student",
  },
  {
    id: "payment-p-1",
    action: "Fee payment received",
    entity: "Ada Lovelace",
    timestamp: new Date().toISOString(),
    tone: "success",
    source: "fee",
  },
]

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

function renderActivity(user: AuthUser) {
  mocks.useAuth.mockReturnValue({
    can: (permission: string) => canUser(user, permission),
  })
  mocks.useRecentActivities.mockReturnValue({
    data: activities,
    isPending: false,
    isError: false,
  })

  return render(<RecentActivity />)
}

describe("RecentActivity fee filtering", () => {
  afterEach(() => {
    cleanup()
    mocks.useAuth.mockReset()
    mocks.useRecentActivities.mockReset()
  })

  it("hides fee entries unless fees:view is effective", () => {
    renderActivity(makeUser({ permissions: ["dashboard:view"] }))
    expect(screen.getByText("New student admission")).toBeTruthy()
    expect(screen.queryByText("Fee payment received")).toBeNull()

    cleanup()
    renderActivity(makeUser({ permissions: ["dashboard:view", "fees:view"] }))
    expect(screen.getByText("Fee payment received")).toBeTruthy()
  })
})
