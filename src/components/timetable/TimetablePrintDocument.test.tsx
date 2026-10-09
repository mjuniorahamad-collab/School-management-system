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
  const label = screen.getByText("Lessons on this grid")
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
