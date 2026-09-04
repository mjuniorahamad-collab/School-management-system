import { CalendarClock, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { TIMETABLE_DAYS, TIMETABLE_DAY_LABELS } from "@/types/timetable"
import type { TimetableDay, TimetableEntryListItem } from "@/types/timetable"

interface TimetableGridProps {
  items: TimetableEntryListItem[]
  periodSlots: string[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canDelete: boolean
  onRetry: () => void
  onEdit: (entry: TimetableEntryListItem) => void
  onDelete: (entry: TimetableEntryListItem) => void
}

export function TimetableGrid({
  items,
  periodSlots,
  isPending,
  isError,
  canEdit,
  canDelete,
  onRetry,
  onEdit,
  onDelete,
}: TimetableGridProps) {
  if (isPending) return <GridSkeleton />
  if (isError) return <GridError onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  const entriesByDay = new Map<TimetableDay, Map<string, TimetableEntryListItem>>()
  for (const entry of items) {
    if (!entriesByDay.has(entry.dayOfWeek)) {
      entriesByDay.set(entry.dayOfWeek, new Map())
    }
    entriesByDay.get(entry.dayOfWeek)!.set(entry.periodSlotId, entry)
  }

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="w-40 border-b border-foreground/10 px-4 py-3 font-medium">
                Period
              </th>
              {TIMETABLE_DAYS.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="border-b border-l border-foreground/10 px-3 py-3 text-center font-medium"
                >
                  {TIMETABLE_DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {periodSlots.map((periodId) => (
              <tr key={periodId} className="align-top">
                <th
                  scope="row"
                  className="border-r border-foreground/10 px-4 py-3 text-xs font-medium text-muted-foreground"
                >
                  {periodLabel(items, periodId)}
                </th>
                {TIMETABLE_DAYS.map((day) => {
                  const entry = entriesByDay.get(day)?.get(periodId)
                  return (
                    <td key={day} className="border-l border-foreground/10 px-2 py-2">
                      {entry ? (
                        <div className="flex flex-col gap-1 rounded-lg bg-indigo-50 p-2 dark:bg-indigo-500/10">
                          <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                            {entry.subjectName}
                          </span>
                          <span className="text-xs text-indigo-700/70 dark:text-indigo-300/70">
                            {entry.teacherName}
                          </span>
                          {entry.sectionName && (
                            <Badge
                              variant="secondary"
                              className="w-fit border-transparent text-[10px] font-medium"
                            >
                              Sec {entry.sectionName}
                            </Badge>
                          )}
                          {(canEdit || canDelete) && (
                            <span className="mt-1 flex items-center gap-1">
                              {canEdit && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-indigo-700 dark:text-indigo-300"
                                  onClick={() => onEdit(entry)}
                                  aria-label={`Edit ${entry.subjectName} on ${TIMETABLE_DAY_LABELS[day]}`}
                                >
                                  <Pencil className="size-3.5" aria-hidden="true" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-indigo-700/70 hover:text-red-600 dark:text-indigo-300/70"
                                  onClick={() => onDelete(entry)}
                                  aria-label={`Delete ${entry.subjectName} on ${TIMETABLE_DAY_LABELS[day]}`}
                                >
                                  <Trash2 className="size-3.5" aria-hidden="true" />
                                </Button>
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="block h-16" aria-hidden="true" />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function periodLabel(items: TimetableEntryListItem[], periodId: string): string {
  const entry = items.find((e) => e.periodSlotId === periodId)
  if (!entry) return "—"
  return `${entry.periodSlotName} (${entry.periodSlotStartTime}–${entry.periodSlotEndTime})`
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-16 text-center">
      <CalendarClock className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No timetable entries</p>
      <p className="text-sm text-muted-foreground">
        Add an entry to start building the weekly timetable.
      </p>
    </div>
  )
}

function GridError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
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
}

function GridSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
