import { formatShortDate } from "@/lib/format"
import {
  ReportEmpty,
  ReportStatGrid,
  ResultsPagination,
  StatusBadge,
  TableShell,
} from "@/components/reports/shared"
import type { StudentRosterReport } from "@/types/reports"

interface StudentRosterViewProps {
  report: StudentRosterReport
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function StudentRosterView({ report, page, totalPages, onPageChange }: StudentRosterViewProps) {
  const breakdown = report.summary.classBreakdown
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ReportStatGrid
          stats={[{ label: "Enrolled students", value: String(report.summary.total) }]}
        />
        {breakdown.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {breakdown.map((entry) => (
              <span
                key={entry.classId}
                className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
              >
                {entry.className}: {entry.count}
              </span>
            ))}
          </div>
        )}
      </div>

      {report.items.length === 0 ? (
        <ReportEmpty message={`No students are enrolled in ${report.session.name}.`} />
      ) : (
        <>
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Admission</th>
                  <th scope="col" className="px-4 py-3 font-medium">Student</th>
                  <th scope="col" className="px-4 py-3 font-medium">Class</th>
                  <th scope="col" className="px-4 py-3 font-medium">Section</th>
                  <th scope="col" className="px-4 py-3 font-medium">Gender</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Phone</th>
                  <th scope="col" className="px-4 py-3 font-medium">Admission date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
              {report.items.map((item) => (
                <tr key={item.studentId} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 whitespace-nowrap font-medium tabular-nums">{item.admissionNumber}</td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.name}</p>
                      {item.email && <p className="truncate text-xs text-muted-foreground">{item.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{item.className}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{item.sectionName ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {item.gender.charAt(0).toUpperCase() + item.gender.slice(1).toLowerCase()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{item.phone ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatShortDate(item.admissionDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableShell>
          <ResultsPagination
            page={page}
            totalPages={totalPages}
            total={report.pagination.total}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  )
}