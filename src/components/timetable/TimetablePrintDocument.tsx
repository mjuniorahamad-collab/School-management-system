import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import type { PeriodSlotListItem } from "@/types/masterData"
import {
  TIMETABLE_DAYS,
  TIMETABLE_DAY_LABELS,
  type TimetableDay,
  type TimetableEntryListItem,
} from "@/types/timetable"

export interface TimetablePrintScope {
  academicSession: string
  className: string
  sectionName: string
}

/**
 * The printed weekly timetable (landscape).
 *
 * Laid out as a period x day grid — the shape a teacher actually reads — using the
 * entries and period slots the page has already loaded. It never fetches: the
 * timetable endpoint returns the whole weekly scope in one response, so there is no
 * paging to reconcile and no completeness check to perform.
 *
 * Rows follow the period slots' own `sortOrder`; columns follow the canonical day
 * order. Empty cells print as an em dash rather than being dropped, so a blank
 * period is visibly blank instead of silently missing.
 *
 * This is a grid, not a `PrintTable`: the leading column is a two-line row header
 * and each cell stacks subject, teacher and class. It still takes its type from
 * the print scale and its cell borders from the print stylesheet, and it must not
 * hand-write either — a per-cell `border-*` here would print a visibly different
 * rule from every other table in the app.
 */
export function TimetablePrintDocument({
  entries,
  periodSlots,
  scope,
}: {
  entries: TimetableEntryListItem[]
  periodSlots: PeriodSlotListItem[]
  scope: TimetablePrintScope
}) {
  const byDay = new Map<TimetableDay, Map<string, TimetableEntryListItem>>()
  for (const entry of entries) {
    if (!byDay.has(entry.dayOfWeek)) byDay.set(entry.dayOfWeek, new Map())
    byDay.get(entry.dayOfWeek)!.set(entry.periodSlotId, entry)
  }

  const rows = [...periodSlots].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <PrintDocument
      eyebrow="Timetable"
      title="Weekly Timetable"
      subtitle={`${scope.className} · ${scope.sectionName} · ${scope.academicSession}`}
      meta={
        <PrintFieldGrid
          fields={[
            { label: "Class", value: scope.className },
            { label: "Section", value: scope.sectionName },
            { label: "Session", value: scope.academicSession },
            { label: "Lessons on this grid", value: String(entries.length) },
          ]}
          columns={4}
        />
      }
      note="Rows follow the period slots' own order and columns the canonical school week. A dash marks a period with no lesson recorded; it is not a free period."
    >
      <PrintSection title="Weekly grid">
        <table className="print-document-table print-document-table-compact w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" style={{ width: "13%" }} className="text-left font-semibold">
                Period
              </th>
              {TIMETABLE_DAYS.map((day) => (
                <th key={day} scope="col" className="text-left font-semibold">
                  {TIMETABLE_DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={TIMETABLE_DAYS.length + 1} className="text-center">
                  No period slots are configured.
                </td>
              </tr>
            ) : (
              rows.map((slot) => (
                <tr key={slot.id}>
                  <th scope="row" className="text-left align-top font-semibold">
                    {slot.name}
                    <span className="block font-normal">
                      {slot.startTime}–{slot.endTime}
                    </span>
                  </th>
                  {TIMETABLE_DAYS.map((day) => {
                    const entry = byDay.get(day)?.get(slot.id)
                    return (
                      <td key={day} className="align-top">
                        {entry === undefined ? (
                          <span className="block text-center">—</span>
                        ) : (
                          <>
                            <span className="font-semibold">{entry.subjectCode}</span>
                            <span className="block">{entry.subjectName}</span>
                            <span className="block font-normal">{entry.teacherName}</span>
                            <span className="block font-normal">
                              {entry.className}
                              {entry.sectionName !== null && entry.sectionName !== undefined && entry.sectionName !== ""
                                ? ` · ${entry.sectionName}`
                                : ""}
                            </span>
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PrintSection>
    </PrintDocument>
  )
}
