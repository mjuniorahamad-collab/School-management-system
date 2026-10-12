// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TimetableList } from "@/components/timetable/TimetableList"
import { makeScaleEntries, makeScalePeriodSlots } from "@/lib/timetableScaleFixtures"

afterEach(() => {
  cleanup()
})

function renderScaleList() {
  const slots = makeScalePeriodSlots()
  const entries = makeScaleEntries(undefined, slots)
  const utils = render(
    <TimetableList
      items={entries}
      periodSlots={slots}
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

// DB-free scale coverage: the List must render one row per lesson (never a count or
// a clamp) and apply the canonical order rather than the API's row order.

describe("TimetableList at scale", () => {
  it("renders one list item and one class label per lesson", () => {
    const { container, entries } = renderScaleList()

    expect(entries.length).toBeGreaterThan(100)
    expect(container.querySelectorAll("ul > li")).toHaveLength(entries.length)
    expect(screen.getAllByText(/^Class /)).toHaveLength(entries.length)
  })

  it("renders the same order for the same records regardless of input order", () => {
    const slots = makeScalePeriodSlots()
    const entries = makeScaleEntries(undefined, slots)

    const forward = render(
      <TimetableList
        items={entries}
        periodSlots={slots}
        isPending={false}
        isError={false}
        canEdit
        canDelete
        onRetry={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const forwardText = forward.container.textContent ?? ""
    cleanup()

    const reversed = render(
      <TimetableList
        items={[...entries].reverse()}
        periodSlots={slots}
        isPending={false}
        isError={false}
        canEdit
        canDelete
        onRetry={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(reversed.container.textContent).toBe(forwardText)
  })
})
