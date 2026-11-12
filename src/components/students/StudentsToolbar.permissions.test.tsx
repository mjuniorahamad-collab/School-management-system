// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { StudentsToolbar } from "@/components/students/StudentsToolbar"

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: mocks.useAuth }))
vi.mock("@/hooks/useStudents", () => ({
  useStudentsMeta: () => ({ data: { classes: [], academicSessions: [] } }),
}))

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

function renderToolbar(user: AuthUser) {
  mocks.useAuth.mockReturnValue({
    can: (permission: string) => canUser(user, permission),
  })

  return render(
    <StudentsToolbar
      search=""
      classId=""
      sectionId=""
      status=""
      sessionId=""
      exportHref="/students/export"
      onSearchChange={() => {}}
      onClassChange={() => {}}
      onSectionChange={() => {}}
      onStatusChange={() => {}}
      onSessionChange={() => {}}
    />,
  )
}

describe("StudentsToolbar export permissions", () => {
  afterEach(() => {
    cleanup()
    mocks.useAuth.mockReset()
  })

  it("shows the Export action only when students:export is effective", () => {
    renderToolbar(makeUser({ permissions: ["students:view"] }))
    expect(screen.queryByRole("link", { name: "Export" })).toBeNull()

    cleanup()
    renderToolbar(makeUser({ permissions: ["students:view", "students:export"] }))
    expect(screen.getByRole("link", { name: "Export" })).toBeTruthy()
  })
})
