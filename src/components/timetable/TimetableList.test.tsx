// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TimetableList } from "@/components/timetable/TimetableList"
import type { TimetableEntryListItem } from "@/types/timetable"

// DOM tests for the mobile/compact timetable list.
//
// Regression under test: every TimetableList container (populated, empty,
// error, skeleton) carried `lg:hidden`, so on desktop widths the list was
// display:none even when the toolbar explicitly selected List — the whole
// timetable area went blank. The class contract below fails if any of the
// four states reintroduces a hidden-utility token.

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

function renderList(
  items: TimetableEntryListItem[],
  options: {
    isPending?: boolean
    isError?: boolean
    onEdit?: (entry: TimetableEntryListItem) => void
    onDelete?: (entry: TimetableEntryListItem) => void
    onRetry?: () => void
  } = {},
) {
  const onEdit = options.onEdit ?? vi.fn()
  const onDelete = options.onDelete ?? vi.fn()
  const onRetry = options.onRetry ?? vi.fn()
  const utils = render(
    <TimetableList
      items={items}
      isPending={options.isPending ?? false}
      isError={options.isError ?? false}
      canEdit
      canDelete
      onRetry={onRetry}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  return { ...utils, onEdit, onDelete, onRetry }
}

/** Tokens like `hidden` / `lg:hidden` that force display:none at some width. */
function visibilityHidingTokens(root: Element | null): string[] {
  if (!root) return ["<no root>"]
  return root.className
    .split(/\s+/)
    .filter((token) => /^(?:[a-z0-9-]+:)*hidden$/.test(token))
}

function rootOf(utils: ReturnType<typeof renderList>): Element | null {
  return utils.container.firstElementChild
}

describe("TimetableList populated rows", () => {
  it("renders every entry with its day, subject, teacher, period/time and section", () => {
    renderList([
      makeEntry({ id: "entry-math" }),
      makeEntry({
        id: "entry-eng",
        dayOfWeek: "TUESDAY",
        subjectId: "subject-eng",
        subjectName: "English",
        subjectCode: "ENG",
        teacherId: "teacher-2",
        teacherName: "Rita Reader",
        sectionId: "section-6b",
        sectionName: "B",
      }),
    ])

    expect(screen.getByText("Monday")).toBeTruthy()
    expect(screen.getByText("Tuesday")).toBeTruthy()
    expect(screen.getByText("Mathematics")).toBeTruthy()
    expect(screen.getByText("Tim Timetable")).toBeTruthy()
    expect(screen.getAllByText("Period 1")).toHaveLength(2)
    expect(screen.getAllByText("08:00–08:45")).toHaveLength(2)
    expect(screen.getByText("Sec A")).toBeTruthy()
    expect(screen.getByText("English")).toBeTruthy()
    expect(screen.getByText("Rita Reader")).toBeTruthy()
    expect(screen.getByText("Sec B")).toBeTruthy()
  })

  it("renders each input entry exactly once, one list item per entry id", () => {
    const { container } = renderList([
      makeEntry({ id: "entry-a" }),
      makeEntry({ id: "entry-b", sectionName: "B" }),
    ])

    expect(container.querySelectorAll("ul > li")).toHaveLength(2)
    expect(screen.getAllByText("Mathematics")).toHaveLength(2)
  })

  it("does not collapse entries that share a subject name", () => {
    const { container } = renderList([
      makeEntry({ id: "entry-6a", sectionId: "section-6a", sectionName: "A" }),
      makeEntry({
        id: "entry-6b",
        sectionId: "section-6b",
        sectionName: "B",
        className: "7",
      }),
    ])

    expect(container.querySelectorAll("ul > li")).toHaveLength(2)
    expect(screen.getByText("Sec A")).toBeTruthy()
    expect(screen.getByText("Sec B")).toBeTruthy()
    expect(screen.getAllByText("Mathematics")).toHaveLength(2)
  })

  it("sends edit and delete actions to the entry in their own row", () => {
    const mathematics = makeEntry({ id: "entry-math", subjectName: "Mathematics" })
    const science = makeEntry({
      id: "entry-sci",
      dayOfWeek: "TUESDAY",
      subjectId: "subject-sci",
      subjectName: "Science",
      subjectCode: "SCI",
    })

    const { onEdit, onDelete } = renderList([mathematics, science])

    const rows = screen.getAllByRole("listitem")
    const scienceRow = rows.find((row) => within(row).queryByText("Science"))
    if (!scienceRow) throw new Error("Science row not found")

    fireEvent.click(within(scienceRow).getByRole("button", { name: "Edit Science" }))
    fireEvent.click(within(scienceRow).getByRole("button", { name: "Delete Science" }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(science)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(science)
  })
})

describe("TimetableList states", () => {
  it("shows the empty state when there are no entries", () => {
    const { container } = renderList([])

    expect(screen.getByText("No timetable entries")).toBeTruthy()
    expect(container.querySelectorAll("ul > li")).toHaveLength(0)
  })

  it("shows the error state and retries on demand", () => {
    const onRetry = vi.fn()
    renderList([], { isError: true, onRetry })

    expect(screen.getByText("Could not load the timetable.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("shows the loading skeleton while the query is pending", () => {
    const { container } = renderList([], { isPending: true })

    expect(container.querySelector("[data-slot='skeleton']")).toBeTruthy()
    expect(screen.queryByText("No timetable entries")).toBeNull()
  })
})

describe("TimetableList responsive visibility contract", () => {
  it("keeps lg:hidden out of all four states", () => {
    const entry = makeEntry({ id: "entry-only" })

    const populated = renderList([entry])
    expect(visibilityHidingTokens(rootOf(populated))).toEqual([])
    cleanup()

    const empty = renderList([])
    expect(visibilityHidingTokens(rootOf(empty))).toEqual([])
    cleanup()

    const error = renderList([], { isError: true })
    expect(visibilityHidingTokens(rootOf(error))).toEqual([])
    cleanup()

    const pending = renderList([], { isPending: true })
    expect(visibilityHidingTokens(rootOf(pending))).toEqual([])
  })
})
