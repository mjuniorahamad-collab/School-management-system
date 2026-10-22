// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TimetablePrintDocument } from "@/components/timetable/TimetablePrintDocument"
import { makeScaleEntries, makeScalePeriodSlots, SCALE_CLASS_COUNT } from "@/lib/timetableScaleFixtures"
import { TIMETABLE_DAYS } from "@/types/timetable"

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

const scope = { academicSession: "2026-27", className: "6", sectionName: "A" }

// Compares the detailed schedule's ROWS, not the whole document. The document
// footer prints the current minute, so two renders can legitimately differ there;
// the order guarantee is about the lesson rows.
const detailedRowTexts = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll("tbody tr"), (row) => row.textContent ?? "")

// DB-free scale coverage: neither print layout may drop or clamp lessons at a real
// school's per-session load. The complete selected-session scope is what gets
// printed — there is no pagination to reconcile on this endpoint.

describe("TimetablePrintDocument at scale", () => {
  it("prints every lesson exactly once in the detailed layout", () => {
    const slots = makeScalePeriodSlots()
    const entries = makeScaleEntries(undefined, slots)

    const { container } = render(
      <TimetablePrintDocument
        entries={entries}
        periodSlots={slots}
        scope={{ ...scope, className: "All classes", sectionName: "All sections" }}
        layout="detailed"
      />,
    )

    expect(entries.length).toBeGreaterThan(100)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(entries.length)
  })

  it("prints every lesson exactly once in the weekly grid layout", () => {
    const slots = makeScalePeriodSlots()
    const entries = makeScaleEntries(undefined, slots)

    const { container } = render(
      <TimetablePrintDocument entries={entries} periodSlots={slots} scope={scope} layout="grid" />,
    )

    expect(container.querySelectorAll("[data-entry-id]")).toHaveLength(entries.length)
    // One header row: Period + each weekday column.
    expect(container.querySelectorAll("thead th")).toHaveLength(7)
  })

  it("prints the same detailed order regardless of input order", () => {
    const slots = makeScalePeriodSlots()
    const entries = makeScaleEntries(undefined, slots)

    const forward = render(
      <TimetablePrintDocument entries={entries} periodSlots={slots} scope={scope} layout="detailed" />,
    )
    const forwardRows = detailedRowTexts(forward.container)
    cleanup()

    const reversed = render(
      <TimetablePrintDocument
        entries={[...entries].reverse()}
        periodSlots={slots}
        scope={scope}
        layout="detailed"
      />,
    )
    const reversedRows = detailedRowTexts(reversed.container)

    expect(forwardRows).toHaveLength(entries.length)
    expect(reversedRows).toEqual(forwardRows)
  })
})

// The grid is period-count agnostic: the print stylesheet applies one compact,
// readable scale and the browser paginates. These assertions prove no lesson is
// dropped, one row per period is rendered, and the weekday columns survive at every
// realistic count — 6, the common 8, and 10/12-period days. JSDOM cannot measure
// paper height, so the physical one-page-or-more fit is verified in Chrome/Edge.
describe("TimetablePrintDocument weekly grid is period-count agnostic", () => {
  const singleClassScope = { academicSession: "2026-27", className: "1", sectionName: "A" }

  it.each([6, 8, 10, 12])("renders every lesson exactly once with %i periods", (periods) => {
    const slots = makeScalePeriodSlots(periods)
    const all = makeScaleEntries(TIMETABLE_DAYS.length * periods * SCALE_CLASS_COUNT, slots)
    const entries = all.filter((entry) => entry.className === "1")

    const { container } = render(
      <TimetablePrintDocument
        entries={entries}
        periodSlots={slots}
        scope={singleClassScope}
        layout="grid"
      />,
    )

    expect(entries).toHaveLength(TIMETABLE_DAYS.length * periods)
    expect(container.querySelectorAll("[data-entry-id]")).toHaveLength(entries.length)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(periods)
    expect(container.querySelectorAll("thead th")).toHaveLength(TIMETABLE_DAYS.length + 1)
    expect(container.querySelectorAll(".print-timetable-grid-table")).toHaveLength(1)
  })
})
