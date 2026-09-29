// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ExaminationFormDialog } from "@/components/examinations/ExaminationFormDialog"
import type { ExamContext, ExamListItem } from "@/types/exams"

// DOM tests for the examination form's two modes.
//
// Regression under test: on create, "Academic session" and "Exam type" were
// rendered as permanently disabled inputs, so their ids could never be set and
// every submit failed validation — an examination could not be created at all.
// On edit they must stay read-only (the update contract is a strict metadata
// patch), but the submit has to actually reach the update API.
//
// `@/lib/examFormRules` is deliberately NOT mocked: the payload assertions
// traverse the real validation and mapping code.

const { useExamContext, useCreateExam, useUpdateExam } = vi.hoisted(() => ({
  useExamContext: vi.fn(),
  useCreateExam: vi.fn(),
  useUpdateExam: vi.fn(),
}))

vi.mock("@/hooks/useExams", () => ({ useExamContext, useCreateExam, useUpdateExam }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Radix Select drives a scrollable listbox and measures the viewport. jsdom
// provides neither, so the Select cannot open without these shims.
beforeEach(() => {
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

const SESSION_OLD = "00000000-0000-4000-8000-0000000000a1"
const SESSION_ACTIVE = "00000000-0000-4000-8000-0000000000a2"
const SESSION_FUTURE = "00000000-0000-4000-8000-0000000000a3"
const TYPE_TERM_1 = "00000000-0000-4000-8000-0000000000b1"
const CLASS_SIX = "00000000-0000-4000-8000-0000000000c1"
const SECTION_A = "00000000-0000-4000-8000-0000000000c2"
const SUBJECT_MAT = "00000000-0000-4000-8000-0000000000d1"
const TEACHER_TARA = "00000000-0000-4000-8000-0000000000e1"

function context(overrides: Partial<ExamContext> = {}): ExamContext {
  return {
    academicSessions: [
      { id: SESSION_OLD, name: "Academic Year 2024-2025", code: "AY2024-2025", status: "CLOSED" },
      { id: SESSION_ACTIVE, name: "Academic Year 2025-2026", code: "AY2025-2026", status: "ACTIVE" },
      { id: SESSION_FUTURE, name: "Academic Year 2026-2027", code: "AY2026-2027", status: "UPCOMING" },
    ],
    examTypes: [
      { id: TYPE_TERM_1, code: "TERM_1", name: "Term 1" },
      { id: "00000000-0000-4000-8000-0000000000b2", code: "FINAL", name: "Final" },
    ],
    classes: [
      {
        id: CLASS_SIX,
        name: "Six",
        sections: [
          { id: SECTION_A, name: "A" },
          { id: "00000000-0000-4000-8000-0000000000c3", name: "B" },
        ],
      },
    ],
    subjects: [{ id: SUBJECT_MAT, code: "MAT", name: "Mathematics" }],
    teachers: [{ id: TEACHER_TARA, name: "Tara Teacher" }],
    ...overrides,
  }
}

function exam(overrides: Partial<ExamListItem> = {}): ExamListItem {
  return {
    id: "exam-1",
    academicSessionId: SESSION_ACTIVE,
    academicSessionName: "Academic Year 2025-2026",
    examTypeId: TYPE_TERM_1,
    examTypeCode: "TERM_1",
    examTypeName: "Term 1",
    name: "Term 1 Examination",
    classId: CLASS_SIX,
    className: "Six",
    sectionId: SECTION_A,
    sectionName: "A",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    status: "DRAFT",
    publishedAt: null,
    finalizedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

const createMutate = vi.fn()
const updateMutate = vi.fn()

function mockContext(value: ExamContext) {
  useExamContext.mockReturnValue({ data: value })
}

function renderCreate(ctx: ExamContext = context()) {
  mockContext(ctx)
  return render(<ExaminationFormDialog open onOpenChange={vi.fn()} editing={null} />)
}

function renderEdit(item: ExamListItem = exam(), ctx: ExamContext = context()) {
  mockContext(ctx)
  return render(<ExaminationFormDialog open onOpenChange={vi.fn()} editing={item} />)
}

const sessionPicker = () => screen.queryByRole("combobox", { name: /academic session/i })
const typePicker = () => screen.queryByRole("combobox", { name: /^exam type$/i })

/**
 * The dialog's pre-existing <Label>s are not associated with their controls, so
 * the fields that were already there before this change have no accessible name.
 * Address them through their field wrapper instead of adding labelling to
 * controls outside this change's scope.
 */
function pickerLabelled(label: string): HTMLElement | null {
  const field = screen.getByText(label).closest("div")
  return field ? within(field).queryByRole("combobox") : null
}

const classPicker = () => pickerLabelled("Class")
const sectionPicker = () => pickerLabelled("Section")
const teacherPicker = () => pickerLabelled("Teacher")

/** Radix opens its listbox from a pointerdown that looks like a real primary click. */
function open(trigger: HTMLElement | null) {
  fireEvent.pointerDown(trigger as HTMLElement, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  })
  return screen.queryAllByRole("option").map((option) => option.textContent ?? "")
}

function pick(trigger: HTMLElement | null, label: string) {
  fireEvent.pointerDown(trigger as HTMLElement, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.click(screen.getByRole("option", { name: label }))
}

/** Fills the one subject row the create form starts with. */
function fillSubjectRow() {
  pick(pickerLabelled("Subject 1"), "Mathematics (MAT)")
  pick(teacherPicker(), "Tara Teacher")
  const numbers = screen.getAllByRole("spinbutton")
  fireEvent.change(numbers[0], { target: { value: "100" } })
  fireEvent.change(numbers[1], { target: { value: "40" } })
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /create examination/i }))
}

beforeEach(() => {
  createMutate.mockReset()
  updateMutate.mockReset()
  useExamContext.mockReset()
  useCreateExam.mockReturnValue({ mutate: createMutate, isPending: false })
  useUpdateExam.mockReturnValue({ mutate: updateMutate, isPending: false })
  mockContext(context())
})

afterEach(() => {
  cleanup()
})

describe("ExaminationFormDialog create — the two required selectors exist", () => {
  // The reported bug: both rendered as disabled <Input> showing "—".
  it("renders an academic session control the user can open", () => {
    renderCreate()
    expect(sessionPicker()).not.toBeNull()
    expect(open(sessionPicker())).toHaveLength(3)
  })

  it("renders an exam type control the user can open", () => {
    renderCreate()
    expect(typePicker()).not.toBeNull()
    expect(open(typePicker())).toHaveLength(2)
  })

  // Each select gets its own render: while a Radix listbox is open it marks the
  // rest of the form aria-hidden, so the other trigger cannot be queried.
  it("labels the session options with name and code", () => {
    renderCreate()
    expect(open(sessionPicker())).toContain("Academic Year 2025-2026 (AY2025-2026)")
  })

  it("labels the exam type options with name and code", () => {
    renderCreate()
    expect(open(typePicker())).toContain("Term 1 (TERM_1)")
  })
})

describe("ExaminationFormDialog create — ACTIVE session default", () => {
  // The project convention (Homework, Assignments, Admissions convert, Student
  // enrolment) is to default the academic session to the ACTIVE one.
  it("pre-selects the ACTIVE session", () => {
    renderCreate()
    expect(sessionPicker()?.textContent).toContain("Academic Year 2025-2026 (AY2025-2026)")
  })

  it("falls back to the first session when none is ACTIVE", () => {
    renderCreate(
      context({
        academicSessions: [
          { id: SESSION_OLD, name: "Closed Year", code: "OLD", status: "CLOSED" },
          { id: SESSION_FUTURE, name: "Future Year", code: "NEW", status: "UPCOMING" },
        ],
      }),
    )
    expect(sessionPicker()?.textContent).toContain("Closed Year (OLD)")
  })

  it("shows the placeholder when the school has no sessions", () => {
    renderCreate(context({ academicSessions: [] }))
    expect(sessionPicker()?.textContent).toContain("Select")
    expect(createMutate).not.toHaveBeenCalled()
  })

  // The default is derived, not written into state, so an explicit choice is
  // never overwritten when the context query resolves late.
  it("keeps an explicit non-ACTIVE choice", () => {
    renderCreate()
    pick(sessionPicker(), "Academic Year 2026-2027 (AY2026-2027)")
    expect(sessionPicker()?.textContent).toContain("Academic Year 2026-2027 (AY2026-2027)")
  })
})

describe("ExaminationFormDialog create — exam type is never auto-selected", () => {
  it("shows the placeholder on first open", () => {
    renderCreate()
    expect(typePicker()?.textContent).toContain("Select")
  })

  it("stays unselected even when only one exam type exists", () => {
    renderCreate(
      context({ examTypes: [{ id: TYPE_TERM_1, code: "TERM_1", name: "Term 1" }] }),
    )
    expect(typePicker()?.textContent).toContain("Select")
  })

  it("blocks submission and explains why when no exam type is chosen", () => {
    renderCreate()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Term 1 Examination/i), {
      target: { value: "Term 1 Examination" },
    })
    pick(classPicker(), "Six")
    fillSubjectRow()
    submit()
    expect(createMutate).not.toHaveBeenCalled()
  })
})

describe("ExaminationFormDialog create — selection reaches the payload", () => {
  it("sends the chosen session and exam type, and the defaulted session when untouched", () => {
    renderCreate()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Term 1 Examination/i), {
      target: { value: "Term 1 Examination" },
    })
    pick(typePicker(), "Term 1 (TERM_1)")
    pick(classPicker(), "Six")
    fillSubjectRow()
    submit()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const payload = createMutate.mock.calls[0][0]
    // Session was never touched, so the ACTIVE default must reach the payload.
    expect(payload.academicSessionId).toBe(SESSION_ACTIVE)
    expect(payload.examTypeId).toBe(TYPE_TERM_1)
    expect(payload.classId).toBe(CLASS_SIX)
    expect(payload.name).toBe("Term 1 Examination")
    expect(payload.subjects).toEqual([
      { subjectId: SUBJECT_MAT, teacherId: TEACHER_TARA, maxMarks: 100, passMarks: 40 },
    ])
  })

  it("sends an explicitly chosen session instead of the ACTIVE one", () => {
    renderCreate()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Term 1 Examination/i), {
      target: { value: "Backdated Exam" },
    })
    pick(sessionPicker(), "Academic Year 2026-2027 (AY2026-2027)")
    pick(typePicker(), "Term 1 (TERM_1)")
    pick(classPicker(), "Six")
    fillSubjectRow()
    submit()

    expect(createMutate.mock.calls[0][0].academicSessionId).toBe(SESSION_FUTURE)
  })

  // Regression guard: the fix must not disturb the existing targeting controls.
  it("offers the chosen class's sections", () => {
    renderCreate()
    pick(classPicker(), "Six")
    expect(open(sectionPicker())).toEqual(["Whole class", "A", "B"])
  })

  it("still lets the user narrow the exam to a section", () => {
    renderCreate()
    pick(classPicker(), "Six")
    pick(sectionPicker(), "A")
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Term 1 Examination/i), {
      target: { value: "Term 1 Examination" },
    })
    pick(typePicker(), "Term 1 (TERM_1)")
    fillSubjectRow()
    submit()

    expect(createMutate.mock.calls[0][0].sectionId).toBe(SECTION_A)
  })
})

describe("ExaminationFormDialog create — empty context", () => {
  it("still renders both controls when the school has no master data", () => {
    renderCreate(
      context({ academicSessions: [], examTypes: [], classes: [], subjects: [], teachers: [] }),
    )
    expect(sessionPicker()).not.toBeNull()
    expect(typePicker()).not.toBeNull()
    expect(sessionPicker()?.textContent).toContain("Select")
    expect(typePicker()?.textContent).toContain("Select")
  })
})

describe("ExaminationFormDialog edit — identity stays read-only", () => {
  // updateExamSchema is `.strict()` and accepts only name/startDate/endDate/
  // sectionId, so session, type and class must not become editable here.
  it("shows the session and exam type as read-only values, not pickers", () => {
    renderEdit()
    expect(sessionPicker()).toBeNull()
    expect(typePicker()).toBeNull()
    expect(screen.getByDisplayValue("Academic Year 2025-2026")).toBeDefined()
    expect(screen.getByDisplayValue("Term 1")).toBeDefined()
  })

  it("keeps the class read-only too", () => {
    renderEdit()
    expect(classPicker()).toBeNull()
    expect(screen.getByDisplayValue("Six")).toBeDefined()
  })

  it("keeps the section editable, since the update contract allows it", () => {
    renderEdit()
    expect(sectionPicker()).not.toBeNull()
  })
})

describe("ExaminationFormDialog edit — the submit reaches the update API", () => {
  // Regression: the edit form hides the subject editor, so `subjects` is []. The
  // create-shaped validator demanded at least one subject, so "Save changes"
  // always toasted an error and updateMutation was never called.
  it("calls the update mutation with only the four updatable fields", () => {
    renderEdit()
    fireEvent.change(screen.getByDisplayValue("Term 1 Examination"), {
      target: { value: "Renamed Examination" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const payload = updateMutate.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(["endDate", "name", "sectionId", "startDate"])
    expect(payload.name).toBe("Renamed Examination")
    // The immutable targeting must never ride along on the metadata patch.
    expect(payload).not.toHaveProperty("academicSessionId")
    expect(payload).not.toHaveProperty("examTypeId")
    expect(payload).not.toHaveProperty("classId")
    expect(payload).not.toHaveProperty("subjects")
  })

  it("submits without any edit at all", () => {
    renderEdit()
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))
    expect(updateMutate).toHaveBeenCalledTimes(1)
  })

  it("never calls the create mutation while editing", () => {
    renderEdit()
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))
    expect(createMutate).not.toHaveBeenCalled()
  })
})
