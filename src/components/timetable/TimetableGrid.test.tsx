// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TimetableGrid } from "@/components/timetable/TimetableGrid"
import type { TimetableEntryListItem } from "@/types/timetable"

afterEach(() => {
  cleanup()
})

let entrySeq = 0

function makeEntry(overrides: Partial<TimetableEntryListItem> = {}): TimetableEntryListItem {
  entrySeq += 1
  return {
    id: `entry-${entrySeq}`,
    academicSessionId: "session-1",
    dayOfWeek: "MONDAY",
    periodSlotId: "slot-1",
    periodSlotName: "Period 1",
    periodSlotStartTime: "08:00",
    periodSlotEndTime: "08:45",
    classId: "class-6",
    className: "6",
    sectionId: "section-6a",
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

function renderGrid(
  items: TimetableEntryListItem[],
  options: {
    periodSlots?: string[]
    onEdit?: (entry: TimetableEntryListItem) => void
    onDelete?: (entry: TimetableEntryListItem) => void
  } = {},
) {
  const onEdit = options.onEdit ?? vi.fn()
  const onDelete = options.onDelete ?? vi.fn()
  const utils = render(
    <TimetableGrid
      items={items}
      periodSlots={options.periodSlots ?? ["slot-1"]}
      isPending={false}
      isError={false}
      canEdit
      canDelete
      onRetry={vi.fn()}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  return { ...utils, onEdit, onDelete }
}

function cellContaining(text: string): HTMLElement {
  const node = screen.getByText(text)
  const cell = node.closest("td")
  if (!cell) throw new Error(`No <td> ancestor found for "${text}"`)
  return cell
}

describe("TimetableGrid multi-entry cells", () => {
  it("keeps both lessons visible when two sections share the same day and period", () => {
    const sectionA = makeEntry({
      id: "entry-6a",
      subjectId: "subject-math",
      subjectName: "Mathematics",
      subjectCode: "MAT",
      teacherId: "teacher-1",
      teacherName: "Tim Timetable",
    })
    const sectionB = makeEntry({
      id: "entry-6b",
      sectionId: "section-6b",
      sectionName: "B",
      subjectId: "subject-eng",
      subjectName: "English",
      subjectCode: "ENG",
      teacherId: "teacher-2",
      teacherName: "Rita Reader",
    })

    renderGrid([sectionB, sectionA])

    const cell = cellContaining("Mathematics")
    expect(cell.contains(screen.getByText("English"))).toBe(true)
    expect(within(cell).getByText("Sec A")).toBeTruthy()
    expect(within(cell).getByText("Sec B")).toBeTruthy()
    expect(within(cell).getAllByText("Class 6")).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: /^Edit/ })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: /^Delete/ })).toHaveLength(2)
  })

  it("keeps both lessons visible and labels their class when two classes share the same day and period", () => {
    const classSix = makeEntry({
      id: "entry-class-6",
      className: "6",
      subjectName: "Mathematics",
    })
    const classSeven = makeEntry({
      id: "entry-class-7",
      classId: "class-7",
      className: "7",
      subjectId: "subject-sci",
      subjectName: "Science",
      subjectCode: "SCI",
    })

    renderGrid([classSeven, classSix])

    const cell = cellContaining("Science")
    expect(cell.contains(screen.getByText("Mathematics"))).toBe(true)
    expect(within(cell).getByText("Class 6")).toBeTruthy()
    expect(within(cell).getByText("Class 7")).toBeTruthy()
  })

  it("leaves a single-entry cell unchanged", () => {
    renderGrid([makeEntry({ id: "entry-only" })])

    expect(screen.getByText("Mathematics")).toBeTruthy()
    expect(screen.getByText("Tim Timetable")).toBeTruthy()
    expect(screen.getByText("Sec A")).toBeTruthy()
    expect(screen.queryByText(/^Class /)).toBeNull()
    expect(screen.getByLabelText("Edit Mathematics on Monday")).toBeTruthy()
    expect(screen.getByLabelText("Delete Mathematics on Monday")).toBeTruthy()
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })

  it("records the class and section in multi-entry action labels", () => {
    renderGrid([
      makeEntry({ id: "entry-6a", subjectName: "Mathematics" }),
      makeEntry({
        id: "entry-6b",
        sectionId: "section-6b",
        sectionName: "B",
        subjectName: "English",
      }),
    ])

    expect(screen.getByLabelText("Edit Mathematics (6 A) on Monday")).toBeTruthy()
    expect(screen.getByLabelText("Edit English (6 B) on Monday")).toBeTruthy()
  })

  it("keeps empty cells as placeholders and marks configured-but-empty periods", () => {
    const { container } = renderGrid([makeEntry({ id: "entry-only" })], {
      periodSlots: ["slot-1", "slot-2"],
    })

    // Two period rows across six days = 12 cells, one of them occupied.
    expect(container.querySelectorAll("td .h-16")).toHaveLength(11)
    expect(screen.getByText("—")).toBeTruthy()
  })

  it("orders multiple entries in a cell deterministically regardless of input order", () => {
    const classSix = makeEntry({ id: "entry-class-6", className: "6", subjectName: "Mathematics" })
    const classSeven = makeEntry({
      id: "entry-class-7",
      classId: "class-7",
      className: "7",
      subjectName: "Science",
    })

    const forward = renderGrid([classSix, classSeven])
    const forwardText = forward.container.textContent ?? ""
    cleanup()
    const reversed = renderGrid([classSeven, classSix])
    const reversedText = reversed.container.textContent ?? ""

    expect(forwardText.indexOf("Mathematics")).toBeLessThan(forwardText.indexOf("Science"))
    expect(reversedText.indexOf("Mathematics")).toBeLessThan(reversedText.indexOf("Science"))
  })

  it("falls back to the entry id when all other keys tie", () => {
    const onEdit = vi.fn()
    renderGrid(
      [
        makeEntry({ id: "entry-bbbb" }),
        makeEntry({ id: "entry-aaaa" }),
      ],
      { onEdit },
    )

    const editButtons = screen.getAllByRole("button", { name: /^Edit/ })
    expect(editButtons).toHaveLength(2)
    for (const button of editButtons) fireEvent.click(button)

    expect(onEdit.mock.calls.map((call) => call[0].id)).toEqual([
      "entry-aaaa",
      "entry-bbbb",
    ])
  })

  it("sends edit and delete actions to the entry in their own block", () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const classSix = makeEntry({ id: "entry-class-6", className: "6", subjectName: "Mathematics" })
    const classSeven = makeEntry({
      id: "entry-class-7",
      classId: "class-7",
      className: "7",
      subjectName: "Science",
    })

    renderGrid([classSix, classSeven], { onEdit, onDelete })

    const cell = cellContaining("Science")
    const buttons = within(cell).getAllByRole("button")
    fireEvent.click(buttons[2])
    fireEvent.click(buttons[3])

    expect(onEdit).toHaveBeenCalledWith(classSeven)
    expect(onDelete).toHaveBeenCalledWith(classSeven)
  })

  it("renders only the entries it is given", () => {
    renderGrid([makeEntry({ id: "entry-only", subjectName: "Mathematics" })])

    expect(screen.getByText("Mathematics")).toBeTruthy()
    expect(screen.queryByText("Science")).toBeNull()
  })
})
