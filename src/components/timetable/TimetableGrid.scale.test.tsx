// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TimetableGrid } from "@/components/timetable/TimetableGrid"
import { makeScaleEntries, makeScalePeriodSlots } from "@/lib/timetableScaleFixtures"

afterEach(() => {
  cleanup()
})

function renderScaleGrid() {
  const slots = makeScalePeriodSlots()
  const entries = makeScaleEntries(undefined, slots)
  const utils = render(
    <TimetableGrid
      items={entries}
      periodSlots={slots.map((slot) => slot.id)}
      isPending={false}
      isError={false}
      canEdit
      canDelete
      onRetry={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  return { ...utils, entries }
}

// DB-free scale coverage: at a real school's per-session load the grid must render
// every lesson once and keep stacking shared day+period cells, not clamp or drop.

describe("TimetableGrid at scale", () => {
  it("renders exactly one action pair per lesson", () => {
    const { entries } = renderScaleGrid()

    expect(entries.length).toBeGreaterThan(100)
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(entries.length)
    expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(entries.length)
  }, 15_000)

  it("still stacks multiple lessons inside a shared day and period cell", () => {
    const { container } = renderScaleGrid()

    const cells = Array.from(container.querySelectorAll("td"))
    const multi = cells.filter(
      (cell) => cell.querySelectorAll('button[aria-label^="Edit "]').length > 1,
    )
    expect(multi.length).toBeGreaterThan(0)
  })
})
