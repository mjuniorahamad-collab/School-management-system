// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TimetableFormDialog } from "@/components/timetable/TimetableFormDialog"
import { resolveStoredPeriodSlot } from "@/lib/timetableFormRules"
import type { TimetableEntryListItem } from "@/types/timetable"

// Coverage for a period slot that was RETIRED after the lesson was created.
//
// WHY: the period picker offers ACTIVE slots only, so an entry pointing at a
// retired slot used to render an empty period and the client re-submitted the
// whole form — which the server then rejected, freezing the lesson.
//
// The rules this test pins down:
//   - the stored (retired) slot is offered again, clearly labelled "inactive";
//   - the form says out loud that the lesson uses a retired period;
//   - an entry whose slot is still ACTIVE gets no such label;
//   - nothing is offered for a new (not yet saved) lesson.

const {
  listSessionsMock,
  listClassesMock,
  listSectionsMock,
  listSubjectsMock,
  listTeachersMock,
  listPeriodSlotsMock,
} = vi.hoisted(() => ({
  listSessionsMock: vi.fn(),
  listClassesMock: vi.fn(),
  listSectionsMock: vi.fn(),
  listSubjectsMock: vi.fn(),
  listTeachersMock: vi.fn(),
  listPeriodSlotsMock: vi.fn(),
}))

vi.mock("@/hooks/useTimetable", () => ({
  useCreateTimetableEntry: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateTimetableEntry: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock("@/services/academicSessionsService", () => ({
  academicSessionsService: { list: listSessionsMock },
}))
vi.mock("@/services/classesService", () => ({ classesService: { list: listClassesMock } }))
vi.mock("@/services/sectionsService", () => ({ sectionsService: { list: listSectionsMock } }))
vi.mock("@/services/subjectsService", () => ({ subjectsService: { list: listSubjectsMock } }))
vi.mock("@/services/teachersService", () => ({ teachersService: { list: listTeachersMock } }))
vi.mock("@/services/masterDataService", () => ({
  periodSlotsService: { list: listPeriodSlotsMock },
}))

const ACTIVE_SLOT = {
  id: "slot-active",
  name: "Period 1",
  startTime: "08:00",
  endTime: "08:45",
}
const RETIRED_SLOT = {
  id: "slot-retired",
  name: "Period 7",
  startTime: "13:00",
  endTime: "13:45",
}

function entry(overrides: Partial<TimetableEntryListItem> = {}): TimetableEntryListItem {
  return {
    id: "entry-1",
    academicSessionId: "sess-1",
    dayOfWeek: "MONDAY",
    periodSlotId: RETIRED_SLOT.id,
    periodSlotName: RETIRED_SLOT.name,
    periodSlotStartTime: RETIRED_SLOT.startTime,
    periodSlotEndTime: RETIRED_SLOT.endTime,
    classId: "cls-6",
    className: "6",
    sectionId: "sec-6a",
    sectionName: "A",
    subjectId: "subject-math",
    subjectName: "Mathematics",
    subjectCode: "MAT",
    teacherId: "teacher-1",
    teacherName: "Tim Timetable",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listSessionsMock.mockReturnValue({
    items: [{ id: "sess-1", name: "Academic Year 2026", code: "AY2026", status: "ACTIVE" }],
    total: 1,
  })
  listClassesMock.mockReturnValue({ items: [{ id: "cls-6", name: "6" }], total: 1 })
  listSectionsMock.mockReturnValue({ items: [{ id: "sec-6a", name: "A" }], total: 1 })
  listSubjectsMock.mockReturnValue({ items: [{ id: "subject-math", name: "Mathematics" }], total: 1 })
  listTeachersMock.mockReturnValue({ items: [{ id: "teacher-1", name: "Tim Timetable" }], total: 1 })
  listPeriodSlotsMock.mockReturnValue({ items: [ACTIVE_SLOT], total: 1 })

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

afterEach(() => {
  cleanup()
})

function renderDialog(editing: TimetableEntryListItem | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimetableFormDialog open onOpenChange={() => {}} editing={editing} />
    </QueryClientProvider>,
  )
}

describe("resolveStoredPeriodSlot", () => {
  it("offers nothing when the entry has no stored slot", () => {
    expect(resolveStoredPeriodSlot([ACTIVE_SLOT], null)).toBeNull()
  })

  it("offers nothing when the stored slot is still active", () => {
    const editing = entry({
      periodSlotId: ACTIVE_SLOT.id,
      periodSlotName: ACTIVE_SLOT.name,
      periodSlotStartTime: ACTIVE_SLOT.startTime,
      periodSlotEndTime: ACTIVE_SLOT.endTime,
    })
    expect(resolveStoredPeriodSlot([ACTIVE_SLOT], editing)).toBeNull()
  })

  it("offers the stored slot when it was retired", () => {
    expect(resolveStoredPeriodSlot([ACTIVE_SLOT], entry())).toEqual({
      id: RETIRED_SLOT.id,
      name: RETIRED_SLOT.name,
      startTime: RETIRED_SLOT.startTime,
      endTime: RETIRED_SLOT.endTime,
    })
  })
})

describe("TimetableFormDialog with a retired period slot", () => {
  it("says the lesson uses a retired period", async () => {
    renderDialog(entry())
    expect(
      await screen.findByText(/this lesson uses a retired period/i),
    ).toBeTruthy()
  })

  it("offers the retired slot again, labelled as inactive", async () => {
    renderDialog(entry())
    await screen.findByText(/this lesson uses a retired period/i)

    const trigger = screen.getByRole("combobox", { name: "Period" })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })

    const option = await screen.findByRole("option", { name: /period 7 .*inactive/i })
    expect(option.textContent).toContain("inactive")
  })

  it("does not mention a retired period when the stored slot is active", async () => {
    renderDialog(
      entry({
        periodSlotId: ACTIVE_SLOT.id,
        periodSlotName: ACTIVE_SLOT.name,
        periodSlotStartTime: ACTIVE_SLOT.startTime,
        periodSlotEndTime: ACTIVE_SLOT.endTime,
      }),
    )
    expect(screen.queryByText(/this lesson uses a retired period/i)).toBeNull()
  })

  it("does not mention a retired period for a new lesson", async () => {
    renderDialog(null)
    expect(screen.queryByText(/this lesson uses a retired period/i)).toBeNull()
  })
})
