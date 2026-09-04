import { Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ATTENDANCE_STATUS_LABELS } from "@/types/attendance"
import type { AttendanceStatusType } from "@/types/attendance"

export interface MarkingStudentRow {
  studentId: string
  studentName: string
  admissionNumber: string
  status: AttendanceStatusType
  note: string
}

interface AttendanceMarkingProps {
  students: MarkingStudentRow[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onStatusChange: (studentId: string, status: AttendanceStatusType) => void
  onNoteChange: (studentId: string, note: string) => void
}

const STATUS_ORDER: AttendanceStatusType[] = ["PRESENT", "ABSENT", "LATE", "HOLIDAY"]

const statusActiveStyles: Record<AttendanceStatusType, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800 border-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-400",
  ABSENT: "bg-red-100 text-red-800 border-red-800 dark:bg-red-500/20 dark:text-red-200 dark:border-red-400",
  LATE: "bg-amber-100 text-amber-800 border-amber-800 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-400",
  HOLIDAY: "bg-sky-100 text-sky-800 border-sky-800 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-400",
}

export function AttendanceMarking({
  students,
  isPending,
  isError,
  onRetry,
  onStatusChange,
  onNoteChange,
}: AttendanceMarkingProps) {
  if (isPending) return <MarkingSkeleton />
  if (isError)
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load students for this class.</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    )
  if (students.length === 0)
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-16 text-center">
        <Users className="size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">No students in this class</p>
        <p className="text-sm text-muted-foreground">
          Select a class and session with enrolled students to mark attendance.
        </p>
      </div>
    )

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="divide-y">
        {students.map((student) => (
          <div
            key={student.studentId}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{student.studentName}</p>
              <p className="text-xs text-muted-foreground">{student.admissionNumber}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_ORDER.map((status) => {
                const active = student.status === status
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onStatusChange(student.studentId, status)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      active
                        ? statusActiveStyles[status]
                        : "border-transparent bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                    aria-pressed={active}
                  >
                    {ATTENDANCE_STATUS_LABELS[status]}
                  </button>
                )
              })}
              <input
                type="text"
                value={student.note}
                onChange={(event) => onNoteChange(student.studentId, event.target.value)}
                placeholder="Note"
                aria-label={`Note for ${student.studentName}`}
                className="ml-1 w-28 rounded border border-input bg-transparent px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MarkingSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-6 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function AttendanceSummaryBadge({ percent }: { percent: number }) {
  const tone =
    percent >= 85
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : percent >= 70
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${tone}`}>
      {percent}%
    </Badge>
  )
}
