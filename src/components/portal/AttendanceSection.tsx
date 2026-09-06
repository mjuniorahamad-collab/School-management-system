import { formatFullDate, formatPercent } from "@/lib/format"
import { usePortalAttendance } from "@/hooks/usePortal"
import { AttendanceStatusBadge } from "@/components/portal/PortalBadges"
import type { PortalAttendanceRecord } from "@/types/portal"

function SummaryStat({
  label,
  value,
  className,
}: {
  label: string
  value: string | number
  className?: string
}) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${className ?? "text-foreground"}`}>{value}</p>
    </div>
  )
}

export function AttendanceSection({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = usePortalAttendance(studentId)

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }
  if (isError || !data) {
    return <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Could not load attendance.</p>
  }

  const summary = data.summary

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{data.session.name}</span>
        <span>
          {data.student.name} · {data.student.admissionNumber}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryStat label="Present" value={summary.present} className="text-emerald-700 dark:text-emerald-300" />
        <SummaryStat label="Late" value={summary.late} className="text-amber-700 dark:text-amber-300" />
        <SummaryStat label="Absent" value={summary.absent} className="text-destructive" />
        <SummaryStat label="Days recorded" value={summary.total} />
        <SummaryStat label="Attendance rate" value={summary.presentRate === null ? "—" : formatPercent(summary.presentRate)} />
      </div>

      {summary.total === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No attendance has been recorded for this session yet.
        </p>
      ) : (
        <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.records.map((record: PortalAttendanceRecord) => (
                  <tr key={record.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatFullDate(record.date)}</td>
                    <td className="px-4 py-3"><AttendanceStatusBadge status={record.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{record.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3 md:hidden">
        {data.records.slice(0, 20).map((record: PortalAttendanceRecord) => (
          <li key={record.id} className="flex items-center justify-between rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="text-sm font-medium text-foreground">{formatFullDate(record.date)}</span>
            <AttendanceStatusBadge status={record.status} />
          </li>
        ))}
      </ul>
    </div>
  )
}