// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TimetablePrintDocument } from "@/components/timetable/TimetablePrintDocument"
import type { PeriodSlotListItem } from "@/types/masterData"
import type { TimetableEntryListItem } from "@/types/timetable"

vi.mock("@/hooks/useBranding", () => ({
  useBranding: () => ({
    data: {
      schoolName: "Bright Future International School",
      tagline: "Excellence",
      schoolShortName: "BFIS",
      contactPhone: "+91 80 4000 1000",
      contactEmail: "office@brightfuture.example.com",
      addressLine1: "12 Lake Road",
      addressLine2: null,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
    },
  }),
}))

afterEach(() => {
  cleanup()
})

const scope = {
  academicSession: "2026-27",
  className: "All classes",
  sectionName: "All sections",
}

const slotOne: PeriodSlotListItem = {
  id: "slot-1",
  name: "Period 1",
  startTime: "08:00",
  endTime: "08:45",
  sortOrder: 1,
  isActive: true,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
}

const slotTwo: PeriodSlotListItem = {
  ...slotOne,
  id: "slot-2",
  name: "Period 2",
  startTime: "08:45",
  endTime: "09:30",
  sortOrder: 2,
  isActive: true,
}

function makeEntry(overrides: Partial<TimetableEntryListItem> = {}): TimetableEntryListItem {
  return {
    id: "entry-1",
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

function lessonCount(): string {
  const label = screen.getByText("Lessons in this schedule")
  return label.parentElement?.querySelector("dd")?.textContent ?? ""
}

function cellContaining(text: string): HTMLElement {
  const node = screen.getByText(text)
  const cell = node.closest("td")
  if (!cell) throw new Error(`No <td> ancestor found for "${text}"`)
  return cell
}

describe("TimetablePrintDocument multi-entry cells", () => {
  it("stacks every lesson that shares a day and period", () => {
    const sectionA = makeEntry({ id: "entry-6a" })
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

    render(
      <TimetablePrintDocument entries={[sectionB, sectionA]} periodSlots={[slotOne]} scope={scope} />,
    )

    const cell = cellContaining("Mathematics")
    expect(cell.contains(screen.getByText("English"))).toBe(true)
    expect(screen.getByText("MAT")).toBeTruthy()
    expect(screen.getByText("ENG")).toBeTruthy()
    expect(screen.getByText("6 · A")).toBeTruthy()
    expect(screen.getByText("6 · B")).toBeTruthy()
    expect(lessonCount()).toBe("2")
  })

  it("orders stacked lessons deterministically regardless of input order", () => {
    const classSix = makeEntry({ id: "entry-class-6", className: "6" })
    const classSeven = makeEntry({
      id: "entry-class-7",
      classId: "class-7",
      className: "7",
      subjectId: "subject-sci",
      subjectName: "Science",
      subjectCode: "SCI",
      teacherId: "teacher-2",
      teacherName: "Rita Reader",
    })

    const forward = render(
      <TimetablePrintDocument entries={[classSix, classSeven]} periodSlots={[slotOne]} scope={scope} />,
    )
    const forwardText = forward.container.textContent ?? ""
    cleanup()
    const reversed = render(
      <TimetablePrintDocument entries={[classSeven, classSix]} periodSlots={[slotOne]} scope={scope} />,
    )
    const reversedText = reversed.container.textContent ?? ""

    expect(forwardText.indexOf("Mathematics")).toBeLessThan(forwardText.indexOf("Science"))
    expect(reversedText.indexOf("Mathematics")).toBeLessThan(reversedText.indexOf("Science"))
  })

  it("keeps a single lesson and prints an em dash for empty periods", () => {
    render(
      <TimetablePrintDocument
        entries={[makeEntry({ id: "entry-only" })]}
        periodSlots={[slotOne, slotTwo]}
        scope={scope}
      />,
    )

    expect(screen.getByText("Mathematics")).toBeTruthy()
    expect(lessonCount()).toBe("1")
    expect(screen.getAllByText("—")).toHaveLength(11)
  })

  it("reports no period slots when none are configured", () => {
    render(
      <TimetablePrintDocument entries={[makeEntry({ id: "entry-only" })]} periodSlots={[]} scope={scope} />,
    )

    expect(screen.getByText("No period slots are configured.")).toBeTruthy()
  })
})

describe("TimetablePrintDocument detailed layout", () => {
  it("renders one row per lesson with the whole-school columns", () => {
    const { container } = render(
      <TimetablePrintDocument
        entries={[makeEntry({ id: "entry-math" })]}
        periodSlots={[slotOne]}
        scope={scope}
        layout="detailed"
      />,
    )

    const table = container.querySelector("table.print-document-table")
    if (!table) throw new Error("Detailed schedule table not found")

    const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
      (th.textContent ?? "").trim(),
    )
    expect(headers).toEqual(["Day", "Period / Time", "Class / Section", "Subject", "Teacher"])
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(screen.getByText("Monday")).toBeTruthy()
    expect(screen.getByText("6 · A")).toBeTruthy()
    expect(screen.getByText("Mathematics")).toBeTruthy()
    expect(screen.getByText("Tim Timetable")).toBeTruthy()
  })

  it("orders lessons by day, then the configured period sortOrder, then class/section", () => {
    const earlySlot = makeEntry({
      id: "entry-early",
      dayOfWeek: "MONDAY",
      periodSlotId: "slot-2",
      periodSlotName: "Period 2",
      periodSlotStartTime: "09:00",
      classId: "class-9",
      className: "9",
      subjectName: "History",
    })
    const laterSlot = makeEntry({
      id: "entry-later",
      dayOfWeek: "MONDAY",
      periodSlotId: "slot-1",
      periodSlotName: "Period 1",
      periodSlotStartTime: "08:00",
      classId: "class-9",
      className: "9",
      subjectName: "Science",
    })

    // Input order is deliberately reversed and the slot start times are set so a
    // start-time sort would disagree with the configured sortOrder.
    const { container } = render(
      <TimetablePrintDocument
        entries={[laterSlot, earlySlot]}
        periodSlots={[slotTwo, slotOne]}
        scope={scope}
        layout="detailed"
      />,
    )

    const rows = Array.from(container.querySelectorAll("tbody tr")).map((tr) =>
      (tr.textContent ?? "").trim(),
    )
    expect(rows[0]?.startsWith("MondayPeriod 1")).toBe(true)
    expect(rows[1]?.startsWith("MondayPeriod 2")).toBe(true)
  })

  it("prints an empty-schedule message when there are no lessons", () => {
    render(
      <TimetablePrintDocument entries={[]} periodSlots={[slotOne]} scope={scope} layout="detailed" />,
    )

    expect(screen.getByText("No lessons recorded for this scope.")).toBeTruthy()
  })

  it("still defaults to the weekly grid when no layout is given", () => {
    render(<TimetablePrintDocument entries={[makeEntry()]} periodSlots={[slotOne]} scope={scope} />)

    expect(screen.getByRole("heading", { name: "Weekly grid", level: 2 })).toBeTruthy()
    expect(screen.queryByText("Lesson schedule")).toBeNull()
  })
})

describe("TimetablePrintDocument pagination structure", () => {
  it("keeps the grid heading and table outside the section-block that forces page breaks", () => {
    render(
      <TimetablePrintDocument entries={[makeEntry()]} periodSlots={[slotOne]} scope={scope} />,
    )

    const heading = screen.getByRole("heading", { name: "Weekly grid", level: 2 })
    const table = screen.getByRole("table")

    expect(heading).toBeTruthy()
    expect(table).toBeTruthy()

    let current: HTMLElement | null = heading.parentElement
    let foundSectionBlock = false
    while (current) {
      if (current.classList.contains("print-document-section-block")) {
        foundSectionBlock = true
        break
      }
      current = current.parentElement
    }

    expect(foundSectionBlock).toBe(false)
  })
})

describe("TimetablePrintDocument density scoping", () => {
  it("marks the individual-class grid with the dedicated print hooks", () => {
    const { container } = render(
      <TimetablePrintDocument
        entries={[makeEntry()]}
        periodSlots={[slotOne]}
        scope={scope}
        layout="grid"
      />,
    )

    expect(container.querySelector(".print-document.print-timetable-grid")).not.toBeNull()
    expect(container.querySelector(".print-timetable-grid-table")).not.toBeNull()
  })

  it("never marks the All-classes detailed table with the grid hooks", () => {
    const { container } = render(
      <TimetablePrintDocument
        entries={[makeEntry()]}
        periodSlots={[slotOne]}
        scope={scope}
        layout="detailed"
      />,
    )

    expect(container.querySelector(".print-timetable-grid")).toBeNull()
    expect(container.querySelector(".print-timetable-grid-table")).toBeNull()
  })
})
