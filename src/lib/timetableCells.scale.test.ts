import { describe, expect, it } from "vitest"
import {
  buildPeriodOrder,
  compareTimetableEntries,
  compareTimetableEntriesForList,
  groupTimetableEntries,
  sortTimetableEntriesForList,
} from "@/lib/timetableCells"
import { makeScaleEntries, makeScalePeriodSlots } from "@/lib/timetableScaleFixtures"
import { TIMETABLE_DAYS } from "@/types/timetable"

// DB-free scale coverage for the shared ordering/grouping primitives. These are the
// single source of truth for Grid, List and Print, so proving them at school scale is
// what keeps the three surfaces from drifting.

describe("timetableCells at scale", () => {
  const slots = makeScalePeriodSlots()
  const entries = makeScaleEntries(undefined, slots)

  it("groups every entry into exactly one cell without dropping any", () => {
    const grouped = groupTimetableEntries(entries)

    let total = 0
    for (const day of TIMETABLE_DAYS) {
      const byPeriod = grouped.get(day)
      if (!byPeriod) continue
      for (const cell of byPeriod.values()) total += cell.length
    }

    expect(entries.length).toBeGreaterThan(0)
    expect(total).toBe(entries.length)
  })

  it("sorts every shared cell with the shared within-cell comparator", () => {
    const grouped = groupTimetableEntries(entries)

    for (const byPeriod of grouped.values()) {
      for (const cell of byPeriod.values()) {
        const expected = [...cell].sort(compareTimetableEntries).map((entry) => entry.id)
        expect(cell.map((entry) => entry.id)).toEqual(expected)
      }
    }
  })

  it("orders the flat list deterministically and independently of input order", () => {
    const periodOrder = buildPeriodOrder(slots)

    const forward = sortTimetableEntriesForList(entries, slots)
    const reversed = sortTimetableEntriesForList([...entries].reverse(), slots)

    expect(forward).toHaveLength(entries.length)
    expect(forward.map((entry) => entry.id)).toEqual(reversed.map((entry) => entry.id))

    for (let index = 1; index < forward.length; index += 1) {
      expect(
        compareTimetableEntriesForList(forward[index - 1], forward[index], periodOrder),
      ).toBeLessThanOrEqual(0)
    }
  })

  it("orders a used period slot missing from the options after configured slots, deterministically", () => {
    const orphan = {
      ...entries[0],
      id: "entry-orphan",
      periodSlotId: "slot-missing",
      periodSlotName: "ZZ Orphan",
      periodSlotStartTime: "23:59",
      periodSlotEndTime: "23:59",
    }

    const ordered = sortTimetableEntriesForList([...entries, orphan], slots)
    const monday = ordered.filter((entry) => entry.dayOfWeek === entries[0].dayOfWeek)
    expect(monday[monday.length - 1]?.id).toBe("entry-orphan")

    const reversed = sortTimetableEntriesForList([orphan, ...[...entries].reverse()], slots)
    expect(reversed.map((entry) => entry.id)).toEqual(ordered.map((entry) => entry.id))
  })
})
