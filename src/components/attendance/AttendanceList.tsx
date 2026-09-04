import { CalendarCheck2, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ATTENDANCE_STATUS_LABELS } from "@/types/attendance"
import type { AttendanceRecordListItem, AttendanceStatusType } from "@/types/attendance"

const statusStyles: Record<AttendanceStatusType, string> = {
  PRESENT: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  ABSENT: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
  LATE: "bg-amber-50 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-300",
  HOLIDAY: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
}

interface AttendanceListProps {
  items: AttendanceRecordListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canDelete: boolean
  onRetry: () => void
  onEdit: (record: AttendanceRecordListItem) => void
  onDelete: (record: AttendanceRecordListItem) => void
}

export function AttendanceList({
  items,
  isPending,
  isError,
  canEdit,
  canDelete,
  onRetry,
  onEdit,
  onDelete,
}: AttendanceListProps) {
  if (isPending) return <ListSkeleton />
  if (isError)
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load attendance records.</p>
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
        <CalendarCheck2 className="size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">No attendance records</p>
        <p className="text-sm text-muted-foreground">Mark attendance to see records here.</p>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {items.map((record) => {
        const style = statusStyles[record.status]
        return (
          <div
            key={record.id}
            className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`border-transparent font-medium ${style}`}>
                  {ATTENDANCE_STATUS_LABELS[record.status]}
                </Badge>
                <span className="truncate text-sm font-medium text-foreground">
                  {record.studentName}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{record.admissionNumber}</span>
                <span aria-hidden="true">·</span>
                <span>{record.date}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {record.className}
                  {record.sectionName ? ` · ${record.sectionName}` : ""}
                </span>
                {record.note && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{record.note}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(record)}
                  aria-label={`Edit attendance for ${record.studentName}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
              )}
              {canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(record)}
                  aria-label={`Delete attendance for ${record.studentName}`}
                  className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
