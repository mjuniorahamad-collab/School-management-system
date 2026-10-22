// @vitest-environment jsdom
// DOM coverage for the master-data edit permissions.
//
// WHY: each master-data panel guards its create/edit/retire actions with the
// permission that actually governs the records it writes. A panel that used the
// wrong permission either hid actions from users who may use them, or offered
// actions whose API call would be rejected.
//
//   - Exam types  → exams:update   (the exam-type endpoints)
//   - Fee heads   → fees:update    (the fee-head endpoints)
//   - Grading bands → results:update (grading bands decide results)
//   - Period slots → timetable:update (period slots drive the timetable)
//
// This test pins the exam-type and grading-band mapping, and pins that the
// mapping is per-panel (an exam-type editor is not automatically a grading-band
// editor).

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { PermissionCode } from "@/types/permissions"

const canMock = vi.fn<(code: PermissionCode) => boolean>()

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({ can: canMock }),
}))

vi.mock("@/hooks/useMasterData", () => ({
  useExamTypes: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useCreateExamType: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateExamType: () => ({ mutate: vi.fn(), isPending: false }),
  useSetExamTypeActive: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useGradingBands: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useCreateGradingBand: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateGradingBand: () => ({ mutate: vi.fn(), isPending: false }),
  useSetGradingBandActive: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}))

afterEach(() => {
  cleanup()
  canMock.mockReset()
})

function actorWith(...granted: PermissionCode[]) {
  canMock.mockImplementation((code) => granted.includes(code))
}

describe("master data edit permissions", () => {
  it("hides the exam-type actions from an actor without exams:update", async () => {
    actorWith("exams:view")
    const { ExamTypesPanel } = await import("./ExamTypesPanel")
    render(<ExamTypesPanel />)

    expect(screen.queryAllByRole("button", { name: "New Exam Type" })).toHaveLength(0)
  })

  it("shows the exam-type actions to an actor with exams:update", async () => {
    actorWith("exams:view", "exams:update")
    const { ExamTypesPanel } = await import("./ExamTypesPanel")
    render(<ExamTypesPanel />)

    expect(screen.getAllByRole("button", { name: "New Exam Type" }).length).toBeGreaterThan(0)
  })

  it("hides the grading-band actions from an actor without results:update", async () => {
    actorWith("results:view")
    const { GradingBandsPanel } = await import("./GradingBandsPanel")
    render(<GradingBandsPanel />)

    expect(screen.queryAllByRole("button", { name: "New Grading Band" })).toHaveLength(0)
  })

  it("shows the grading-band actions to an actor with results:update", async () => {
    actorWith("results:view", "results:update")
    const { GradingBandsPanel } = await import("./GradingBandsPanel")
    render(<GradingBandsPanel />)

    expect(screen.getAllByRole("button", { name: "New Grading Band" }).length).toBeGreaterThan(0)
  })

  it("does not let an exam-type editor edit grading bands", async () => {
    actorWith("exams:view", "exams:update")
    const { GradingBandsPanel } = await import("./GradingBandsPanel")
    render(<GradingBandsPanel />)

    expect(screen.queryAllByRole("button", { name: "New Grading Band" })).toHaveLength(0)
  })
})
