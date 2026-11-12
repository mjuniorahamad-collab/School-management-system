// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { DashboardPage } from "@/pages/DashboardPage"

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useDashboardStats: vi.fn(),
  useFeeStat: vi.fn(),
  useAttendance: vi.fn(),
  useFeeAnalytics: vi.fn(),
  useFeeCollectionStatus: vi.fn(),
  useRecentStudents: vi.fn(),
  useTopPerformingClasses: vi.fn(),
  useUpcomingEvents: vi.fn(),
  useImportantNotices: vi.fn(),
  useRecentActivities: vi.fn(),
  useBirthdayStudents: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: mocks.useAuth }))
vi.mock("@/theme/useTheme", () => ({ useTheme: () => ({ isDark: false }) }))
vi.mock("@/hooks/useDashboardData", () => ({
  useDashboardStats: mocks.useDashboardStats,
  useFeeStat: mocks.useFeeStat,
  useAttendance: mocks.useAttendance,
  useFeeAnalytics: mocks.useFeeAnalytics,
  useFeeCollectionStatus: mocks.useFeeCollectionStatus,
  useRecentStudents: mocks.useRecentStudents,
  useTopPerformingClasses: mocks.useTopPerformingClasses,
  useUpcomingEvents: mocks.useUpcomingEvents,
  useImportantNotices: mocks.useImportantNotices,
  useRecentActivities: mocks.useRecentActivities,
  useBirthdayStudents: mocks.useBirthdayStudents,
}))

const HOOKS = [
  mocks.useDashboardStats,
  mocks.useFeeStat,
  mocks.useAttendance,
  mocks.useFeeAnalytics,
  mocks.useFeeCollectionStatus,
  mocks.useRecentStudents,
  mocks.useTopPerformingClasses,
  mocks.useUpcomingEvents,
  mocks.useImportantNotices,
  mocks.useRecentActivities,
  mocks.useBirthdayStudents,
]

const DASHBOARD_WIDGETS = [
  "Attendance Overview",
  "Top Performing Classes",
  "Recent Students",
  "Upcoming Events",
  "Important Notices",
  "Recent Activity",
  "Student Birthdays Today",
]

const FEE_WIDGETS = ["Fees Collection", "Fee Collection Status"]

function pending() {
  return { data: undefined, isPending: true, isError: false }
}

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

function renderDashboard(user: AuthUser) {
  mocks.useAuth.mockReturnValue({
    can: (permission: string) => canUser(user, permission),
  })

  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.useAuth.mockReset()
  for (const hook of HOOKS) {
    hook.mockReset().mockReturnValue(pending())
  }
})

afterEach(() => {
  cleanup()
})

describe("DashboardPage permissions", () => {
  it("renders no dashboard or fee widget without their permissions", () => {
    renderDashboard(makeUser({ permissions: ["students:view"] }))

    for (const label of [...DASHBOARD_WIDGETS, ...FEE_WIDGETS, "Quick Actions"]) {
      expect(screen.queryByText(label), label).toBeNull()
    }

    expect(mocks.useFeeStat).toHaveBeenCalledWith(false)
    expect(mocks.useAttendance).toHaveBeenLastCalledWith("today", false)
    expect(mocks.useFeeAnalytics).toHaveBeenLastCalledWith("session", false)
    expect(mocks.useFeeCollectionStatus).toHaveBeenCalledWith(false)
    expect(mocks.useRecentStudents).toHaveBeenCalledWith(false)
    expect(mocks.useTopPerformingClasses).toHaveBeenCalledWith(false)
    expect(mocks.useUpcomingEvents).toHaveBeenCalledWith(false)
    expect(mocks.useImportantNotices).toHaveBeenCalledWith(false)
    expect(mocks.useRecentActivities).toHaveBeenCalledWith(false)
    expect(mocks.useBirthdayStudents).toHaveBeenCalledWith(false)
  })

  it("keeps fee widgets hidden when fees:view is missing", () => {
    renderDashboard(makeUser({ permissions: ["dashboard:view"] }))

    for (const label of FEE_WIDGETS) {
      expect(screen.queryByText(label), label).toBeNull()
    }
    for (const label of DASHBOARD_WIDGETS) {
      expect(screen.getByText(label), label).toBeTruthy()
    }

    expect(mocks.useFeeStat).toHaveBeenCalledWith(false)
    expect(mocks.useAttendance).toHaveBeenLastCalledWith("today", true)
    expect(mocks.useFeeAnalytics).toHaveBeenLastCalledWith("session", false)
    expect(mocks.useFeeCollectionStatus).toHaveBeenCalledWith(false)
  })

  it("keeps dashboard widgets hidden when only fees:view is effective", () => {
    renderDashboard(makeUser({ permissions: ["fees:view"] }))

    for (const label of DASHBOARD_WIDGETS) {
      expect(screen.queryByText(label), label).toBeNull()
    }
    for (const label of FEE_WIDGETS) {
      expect(screen.getByText(label), label).toBeTruthy()
    }

    expect(mocks.useFeeStat).toHaveBeenCalledWith(true)
    expect(mocks.useFeeAnalytics).toHaveBeenLastCalledWith("session", true)
    expect(mocks.useFeeCollectionStatus).toHaveBeenCalledWith(true)
    expect(mocks.useAttendance).toHaveBeenLastCalledWith("today", false)
  })

  it("does not request or merge the fee stat without fees:view", () => {
    mocks.useDashboardStats.mockReturnValue({
      data: [
        { id: "total-students", label: "Total Students", value: "120", trendPercent: 0, comparison: "vs last month" },
        { id: "total-teachers", label: "Total Teachers", value: "8", trendPercent: 0, comparison: "vs last month" },
        { id: "total-classes", label: "Total Classes", value: "4", trendPercent: 0, comparison: "vs last month" },
      ],
      isPending: false,
      isError: false,
    })
    mocks.useFeeStat.mockReturnValue({
      data: {
        id: "fees-collection",
        label: "Fees Collection",
        value: "₹9,999",
        trendPercent: 0,
        comparison: "vs last month",
      },
      isPending: false,
      isError: false,
    })

    renderDashboard(makeUser({ permissions: ["dashboard:view"] }))

    expect(mocks.useFeeStat).toHaveBeenCalledWith(false)
    expect(screen.getByText("120")).toBeTruthy()
    expect(screen.queryByText("₹9,999")).toBeNull()
  })

  it("requests and merges the fee stat when fees:view is effective", () => {
    mocks.useDashboardStats.mockReturnValue({
      data: [
        { id: "total-students", label: "Total Students", value: "120", trendPercent: 0, comparison: "vs last month" },
        { id: "total-teachers", label: "Total Teachers", value: "8", trendPercent: 0, comparison: "vs last month" },
        { id: "total-classes", label: "Total Classes", value: "4", trendPercent: 0, comparison: "vs last month" },
      ],
      isPending: false,
      isError: false,
    })
    mocks.useFeeStat.mockReturnValue({
      data: {
        id: "fees-collection",
        label: "Fees Collection",
        value: "₹9,999",
        trendPercent: 0,
        comparison: "vs last month",
      },
      isPending: false,
      isError: false,
    })

    renderDashboard(makeUser({ permissions: ["dashboard:view", "fees:view"] }))

    expect(mocks.useFeeStat).toHaveBeenCalledWith(true)
    expect(screen.getByText("₹9,999")).toBeTruthy()
  })

  it("renders data without links to modules the user cannot open", () => {
    mocks.useDashboardStats.mockReturnValue({ data: [], isPending: false, isError: false })
    mocks.useRecentStudents.mockReturnValue({
      data: [
        { id: "s-1", name: "Alice Student", studentClass: "10", section: "A", status: "ACTIVE" },
      ],
      isPending: false,
      isError: false,
    })
    mocks.useTopPerformingClasses.mockReturnValue({
      data: {
        context: null,
        classes: [{ rank: 1, name: "Grade 10", performance: 88, students: 40 }],
      },
      isPending: false,
      isError: false,
    })
    mocks.useUpcomingEvents.mockReturnValue({
      data: [
        {
          id: "e-1",
          title: "Annual Sports Day",
          date: "2099-01-01",
          time: "9:00 AM",
          category: "sports",
        },
      ],
      isPending: false,
      isError: false,
    })
    mocks.useImportantNotices.mockReturnValue({
      data: [
        {
          id: "n-1",
          title: "Annual Notice",
          summary: "School reopens next week.",
          publishedAt: new Date().toISOString(),
          priority: "high",
        },
      ],
      isPending: false,
      isError: false,
    })
    mocks.useBirthdayStudents.mockReturnValue({
      data: [{ id: "s-2", name: "Bob Student", studentClass: "9", age: 15 }],
      isPending: false,
      isError: false,
    })

    renderDashboard(makeUser({ permissions: ["dashboard:view"] }))

    expect(screen.getByText("Alice Student")).toBeTruthy()
    expect(screen.getByText("Grade 10")).toBeTruthy()
    expect(screen.getByText("Annual Sports Day")).toBeTruthy()
    expect(screen.getByText("Annual Notice")).toBeTruthy()
    expect(screen.getByText("Bob Student")).toBeTruthy()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
  })
})
