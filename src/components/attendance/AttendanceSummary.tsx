import { BarChart3, Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { AttendanceSummaryBadge } from "@/components/attendance/AttendanceMarking"
import type { AttendanceSummaryItem } from "@/types/attendance"

interface AttendanceSummaryViewProps {
  items: AttendanceSummaryItem[]
  totalDays: number
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

export function AttendanceSummaryView({
  items,
  totalDays,
  isPending,
  isError,
  onRetry,
}: AttendanceSummaryViewProps) {
  if (isPending) return <SummarySkeleton />
  if (isError)
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load the attendance summary.</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    )
  if (items.length === 0)
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-16 text-center">
        <BarChart3 className="size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">No attendance data</p>
        <p className="text-sm text-muted-foreground">
          Select a class and date range to view the summary.
        </p>
      </div>
    )

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          Class attendance summary
        </div>
        <span className="text-xs text-muted-foreground">{totalDays} school day(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Student</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Present</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Late</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Absent</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Holiday</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.studentId} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <span className="block font-medium text-foreground">{item.studentName}</span>
                  <span className="text-xs text-muted-foreground">{item.admissionNumber}</span>
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground">{item.present}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{item.late}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{item.absent}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{item.holiday}</td>
                <td className="px-4 py-3 text-right">
                  <AttendanceSummaryBadge percent={item.attendancePercent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
