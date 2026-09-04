import { CalendarClock, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { TIMETABLE_DAY_LABELS } from "@/types/timetable"
import type { TimetableEntryListItem } from "@/types/timetable"

interface TimetableListProps {
  items: TimetableEntryListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canDelete: boolean
  onRetry: () => void
  onEdit: (entry: TimetableEntryListItem) => void
  onDelete: (entry: TimetableEntryListItem) => void
}

export function TimetableList({
  items,
  isPending,
  isError,
  canEdit,
  canDelete,
  onRetry,
  onEdit,
  onDelete,
}: TimetableListProps) {
  if (isPending) return <ListSkeleton />
  if (isError)
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center lg:hidden">
        <p className="text-sm text-muted-foreground">Could not load the timetable.</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    )
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-16 text-center lg:hidden">
        <CalendarClock className="size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">No timetable entries</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:hidden">
      <ul className="divide-y">
        {items.map((entry) => (
          <li key={entry.id}>
            <div className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="border-transparent text-[10px] font-medium"
                  >
                    {TIMETABLE_DAY_LABELS[entry.dayOfWeek]}
                  </Badge>
                  <span className="truncate text-sm font-medium text-foreground">
                    {entry.subjectName}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{entry.periodSlotName}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {entry.periodSlotStartTime}–{entry.periodSlotEndTime}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{entry.teacherName}</span>
                  {entry.sectionName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Sec {entry.sectionName}</span>
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
                    onClick={() => onEdit(entry)}
                    aria-label={`Edit ${entry.subjectName}`}
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
                    onClick={() => onDelete(entry)}
                    aria-label={`Delete ${entry.subjectName}`}
                    className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 lg:hidden">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
