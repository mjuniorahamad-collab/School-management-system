import { formatPercent, formatShortDate } from "@/lib/format"
import { ReportEmpty, ReportStatGrid, TableShell } from "@/components/reports/shared"
import type { AttendanceClassRow, AttendanceDailyRow, AttendanceSummaryReport } from "@/types/reports"

const RATE_COLUMNS: Array<{ key: "present" | "late" | "absent" | "holiday"; label: string }> = [
  { key: "present", label: "Present" },
  { key: "late", label: "Late" },
  { key: "absent", label: "Absent" },
  { key: "holiday", label: "Holiday" },
]

function AttendanceTotalsRow({ counts }: { counts: Pick<AttendanceSummaryReport["summary"], "present" | "late" | "absent" | "holiday"> }) {
  return (
    <>
      {RATE_COLUMNS.map((column) => (
        <td key={column.key} className="px-4 py-3 text-right tabular-nums">
          {counts[column.key]}
        </td>
      ))}
    </>
  )
}

export function AttendanceSummaryView({ report }: { report: AttendanceSummaryReport }) {
  const { summary } = report
  const rate = formatPercent(summary.presentRate, 1)
  return (
    <div className="flex flex-col gap-4">
      <ReportStatGrid
        stats={[
          { label: "Present", value: String(summary.present), tone: "positive" },
          { label: "Late", value: String(summary.late), tone: "warning" },
          { label: "Absent", value: String(summary.absent), tone: "negative" },
          { label: "Holidays", value: String(summary.holiday), tone: "default" },
          { label: "Records", value: String(summary.total), tone: "default" },
          { label: "Attendance rate", value: rate, tone: "default" },
        ]}
      />

      {report.classes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Per class</h3>
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Class</th>
                  <th scope="col" className="px-4 py-3 font-medium">Section</th>
                  {RATE_COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className="px-4 py-3 text-right font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.classes.map((row: AttendanceClassRow) => (
                  <tr key={row.classId + (row.sectionId ?? "")} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">{row.className}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {row.sectionName ?? "Whole class"}
                    </td>
                    <AttendanceTotalsRow counts={row} />
                    <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPercent(row.presentRate, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}

      {report.daily.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Daily totals</h3>
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  {RATE_COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className="px-4 py-3 text-right font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.daily.map((row: AttendanceDailyRow) => (
                  <tr key={row.date} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap text-foreground">{formatShortDate(row.date)}</td>
                    <AttendanceTotalsRow counts={row} />
                    <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPercent(row.presentRate, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}

      {report.classes.length === 0 && report.daily.length === 0 && (
        <ReportEmpty message="No attendance records fall within this report's filters." />
      )}
    </div>
  )
}