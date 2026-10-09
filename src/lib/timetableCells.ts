import type { TimetableDay, TimetableEntryListItem } from "@/types/timetable"

/**
 * Day → period slot → every entry occupying that cell. Cells hold arrays, never a
 * single entry: the database deliberately allows several lessons in one day+period
 * (different classes or sections), so a one-entry-per-key structure would silently
 * drop valid lessons from the grid and the printed timetable.
 */
export type TimetableCellMap = Map<TimetableDay, Map<string, TimetableEntryListItem[]>>

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
