import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid } from "@/components/print/PrintFields"
import { PrintTable } from "@/components/print/PrintTable"
import { groupTimetableEntries, sortTimetableEntriesForList } from "@/lib/timetableCells"
import type { PeriodSlotListItem } from "@/types/masterData"
import { TIMETABLE_DAYS, TIMETABLE_DAY_LABELS } from "@/types/timetable"
import type { TimetableEntryListItem } from "@/types/timetable"

export interface TimetablePrintScope {
  academicSession: string
  className: string
  sectionName: string
}

/**
 * The two approved Weekly Timetable layouts.
 *
 * `grid` is the period×weekday sheet for one class/section. `detailed` is the
 * one-row-per-lesson table used for the whole-school ("All classes") scope, where a
 * single dense day/period cell can hold every class and would not fit — or stay
 * readable — inside the grid. The choice is an explicit prop, never inferred from a
 * display string such as the literal "All classes".
 */
export type TimetablePrintLayout = "grid" | "detailed"

interface TimetablePrintDocumentProps {
  entries: TimetableEntryListItem[]
  periodSlots: PeriodSlotListItem[]
  scope: TimetablePrintScope
  layout?: TimetablePrintLayout
}

/**
 * The printed weekly timetable (landscape).
 *
 * Both layouts render only already-loaded entries: the timetable endpoint returns
 * the whole selected-session scope in one response, so there is no paging to
 * reconcile and no completeness check to perform. The lesson count is
 * `entries.length`, the same number the API returned for the selected session.
 *
 * A cell that holds several lessons stacks every one of them in the canonical
 * class/section/subject order, so no valid entry is dropped; empty grid cells print
 * as an em dash rather than being dropped.
 */
export function TimetablePrintDocument({
  entries,
  periodSlots,
  scope,
  layout = "grid",
}: TimetablePrintDocumentProps) {
  return (
    <PrintDocument
      eyebrow="Timetable"
      title="Weekly Timetable"
      subtitle={`${scope.className} · ${scope.sectionName} · ${scope.academicSession}`}
      className={layout === "grid" ? "print-timetable-grid" : undefined}
      meta={
        <PrintFieldGrid
          fields={[
            { label: "Class", value: scope.className },
            { label: "Section", value: scope.sectionName },
            { label: "Session", value: scope.academicSession },
            { label: "Lessons in this schedule", value: String(entries.length) },
          ]}
          columns={4}
        />
      }
      note={
        layout === "detailed"
          ? "One row per lesson, ordered by weekday, then the period slots' own order, then class, section, subject and teacher. The dash rule of the grid does not apply here: every recorded lesson is listed."
          : "Rows follow the period slots' own order and columns the canonical school week. A dash marks a period with no lesson recorded; it is not a free period."
      }
    >
      {layout === "detailed" ? (
        <DetailedSchedule entries={entries} periodSlots={periodSlots} />
      ) : (
        <WeeklyGrid entries={entries} periodSlots={periodSlots} />
      )}
    </PrintDocument>
  )
}

/**
 * The period×weekday grid for a single class/section.
 *
 * Deliberately a `<div>` and an `<h2>`, not the shared `PrintSection`: that wrapper
 * carries `break-inside: avoid-page`, which would force the entire grid to stay on
 * one physical page and spill a large timetable off the sheet. The heading and table
 * must remain independent so the browser can paginate row by row while repeating the
 * header (`thead { display: table-header-group }`).
 *
 * The `print-timetable-grid` hook on the document root and the
 * `print-timetable-grid-table` hook on this table let the print stylesheet apply a
 * compact, readable scale to THIS artifact only. The scale is a fixed typographic
 * choice, never a period-count branch: a normal 6-8 period week fits one landscape
 * A4 sheet, and a longer week paginates, carrying the repeated header and the
 * remaining rows to the next page. No school's period count is assumed.
 */
function WeeklyGrid({
  entries,
  periodSlots,
}: {
  entries: TimetableEntryListItem[]
  periodSlots: PeriodSlotListItem[]
}) {
  const byDay = groupTimetableEntries(entries)
  const rows = [...periodSlots].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div>
      <h2 className="print-document-section">Weekly grid</h2>
      <table className="print-document-table print-document-table-compact print-timetable-grid-table w-full border-collapse">
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
                  const cellEntries = byDay.get(day)?.get(slot.id)
                  return (
                    <td key={day} className="align-top">
                      {cellEntries === undefined ? (
                        <span className="block text-center">—</span>
                      ) : (
                        cellEntries.map((entry, index) => (
                          <span
                            key={entry.id}
                            data-entry-id={entry.id}
                            className={index > 0 ? "mt-1 block" : "block"}
                          >
                            <span className="font-semibold">{entry.subjectCode}</span>
                            <span className="block">{entry.subjectName}</span>
                            <span className="block font-normal">{entry.teacherName}</span>
                            <span className="block font-normal">
                              {entry.className}
                              {entry.sectionName !== null &&
                              entry.sectionName !== undefined &&
                              entry.sectionName !== ""
                                ? ` · ${entry.sectionName}`
                                : ""}
                            </span>
                          </span>
                        ))
                      )}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The detailed whole-school schedule: one row per lesson, in the canonical flat
 * order shared with the List (`sortTimetableEntriesForList`). Uses `PrintTable` so
 * the header repeats on every page and rows never split across a break.
 */
function DetailedSchedule({
  entries,
  periodSlots,
}: {
  entries: TimetableEntryListItem[]
  periodSlots: PeriodSlotListItem[]
}) {
  const rows = sortTimetableEntriesForList(entries, periodSlots)

  return (
    <div>
      <h2 className="print-document-section">Lesson schedule</h2>
      <PrintTable<TimetableEntryListItem>
        compact
        rows={rows}
        rowKey={(entry) => entry.id}
        emptyMessage="No lessons recorded for this scope."
        columns={[
          {
            key: "day",
            header: "Day",
            width: "11%",
            render: (entry) => TIMETABLE_DAY_LABELS[entry.dayOfWeek],
          },
          {
            key: "period",
            header: "Period / Time",
            width: "17%",
            render: (entry) => (
              <span>
                <span className="font-semibold">{entry.periodSlotName}</span>
                <span className="block font-normal">
                  {entry.periodSlotStartTime}–{entry.periodSlotEndTime}
                </span>
              </span>
            ),
          },
          {
            key: "class",
            header: "Class / Section",
            width: "15%",
            render: (entry) =>
              entry.sectionName !== null &&
              entry.sectionName !== undefined &&
              entry.sectionName !== ""
                ? `${entry.className} · ${entry.sectionName}`
                : entry.className,
          },
          {
            key: "subject",
            header: "Subject",
            render: (entry) => (
              <span>
                <span className="font-semibold">{entry.subjectCode}</span>
                <span className="block">{entry.subjectName}</span>
              </span>
            ),
          },
          {
            key: "teacher",
            header: "Teacher",
            render: (entry) => entry.teacherName,
          },
        ]}
      />
    </div>
  )
}
