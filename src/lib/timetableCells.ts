import { TIMETABLE_DAYS } from "@/types/timetable"
import type { TimetableDay, TimetableEntryListItem } from "@/types/timetable"

/**
 * Day → period slot → every entry occupying that cell. Cells hold arrays, never a
 * single entry: the database deliberately allows several lessons in one day+period
 * (different classes or sections), so a one-entry-per-key structure would silently
 * drop valid lessons from the grid and the printed timetable.
 */
export type TimetableCellMap = Map<TimetableDay, Map<string, TimetableEntryListItem[]>>

/**
 * A period's configured position. `sortOrder` comes from the period-slot master
 * data — never inferred from a period's label, which is arbitrary text.
 */
export interface PeriodOrder {
  id: string
  sortOrder: number
}

/** Used period slots with no configured master row sort after every configured one. */
const UNCONFIGURED_PERIOD = Number.MAX_SAFE_INTEGER

/**
 * Deterministic within-cell order: class, section (whole-class entries first),
 * subject, teacher, then the entry id so ties can never depend on API row order.
 */
export function compareTimetableEntries(
  a: TimetableEntryListItem,
  b: TimetableEntryListItem,
): number {
  return (
    a.className.localeCompare(b.className) ||
    (a.sectionName ?? "").localeCompare(b.sectionName ?? "") ||
    a.subjectName.localeCompare(b.subjectName) ||
    a.teacherName.localeCompare(b.teacherName) ||
    a.id.localeCompare(b.id)
  )
}

/** Maps each configured period-slot id to its master-data sort order. */
export function buildPeriodOrder(periodSlots: readonly PeriodOrder[]): Map<string, number> {
  const order = new Map<string, number>()
  for (const slot of periodSlots) order.set(slot.id, slot.sortOrder)
  return order
}

/**
 * Canonical flat order shared by the List and the All Classes detailed print:
 *
 *   1. canonical school weekday order
 *   2. configured period `sortOrder`
 *   3. class name
 *   4. section name (whole-class entries first)
 *   5. subject name
 *   6. teacher name
 *   7. entry id as the final stable tie-breaker
 *
 * `compareTimetableEntries` alone is deliberately NOT enough here: it starts at the
 * class name, so applying it to a flat list would interleave days and periods. This
 * establishes the day/period order first, then defers to the within-cell comparator.
 *
 * A used period slot missing from the options list (e.g. its master row was deleted
 * while entries still reference it) is ordered after every configured slot by start
 * time, then name, then id, so its position is still deterministic rather than
 * falling back to API row order.
 */
export function compareTimetableEntriesForList(
  a: TimetableEntryListItem,
  b: TimetableEntryListItem,
  periodOrder: ReadonlyMap<string, number>,
): number {
  const dayDelta = TIMETABLE_DAYS.indexOf(a.dayOfWeek) - TIMETABLE_DAYS.indexOf(b.dayOfWeek)
  if (dayDelta !== 0) return dayDelta

  const aOrder = periodOrder.get(a.periodSlotId) ?? UNCONFIGURED_PERIOD
  const bOrder = periodOrder.get(b.periodSlotId) ?? UNCONFIGURED_PERIOD
  if (aOrder !== bOrder) return aOrder - bOrder

  if (aOrder === UNCONFIGURED_PERIOD) {
    const startDelta = a.periodSlotStartTime.localeCompare(b.periodSlotStartTime)
    if (startDelta !== 0) return startDelta
    const nameDelta = a.periodSlotName.localeCompare(b.periodSlotName)
    if (nameDelta !== 0) return nameDelta
    const slotDelta = a.periodSlotId.localeCompare(b.periodSlotId)
    if (slotDelta !== 0) return slotDelta
  }

  return compareTimetableEntries(a, b)
}

/** Returns a new array ordered by the canonical flat order. Never mutates input. */
export function sortTimetableEntriesForList(
  entries: readonly TimetableEntryListItem[],
  periodSlots: readonly PeriodOrder[] = [],
): TimetableEntryListItem[] {
  const periodOrder = buildPeriodOrder(periodSlots)
  return [...entries].sort((a, b) => compareTimetableEntriesForList(a, b, periodOrder))
}

export function groupTimetableEntries(entries: TimetableEntryListItem[]): TimetableCellMap {
  const grouped: TimetableCellMap = new Map()
  for (const entry of entries) {
    let byPeriod = grouped.get(entry.dayOfWeek)
    if (!byPeriod) {
      byPeriod = new Map()
      grouped.set(entry.dayOfWeek, byPeriod)
    }
    const cell = byPeriod.get(entry.periodSlotId)
    if (cell) cell.push(entry)
    else byPeriod.set(entry.periodSlotId, [entry])
  }
  for (const byPeriod of grouped.values()) {
    for (const cell of byPeriod.values()) cell.sort(compareTimetableEntries)
  }
  return grouped
}
