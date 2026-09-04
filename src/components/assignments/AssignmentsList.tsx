import { CalendarClock, Pencil, Send, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskStatusBadge } from "@/components/shared/TaskStatusBadge"
import { formatFullDate } from "@/lib/format"
import type { AssignmentListItem } from "@/types/assignments"

interface AssignmentsViewProps {
  items: AssignmentListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
  onRetry: () => void
  onView: (assignment: AssignmentListItem) => void
  onEdit: (assignment: AssignmentListItem) => void
  onPublish: (assignment: AssignmentListItem) => void
  onDelete: (assignment: AssignmentListItem) => void
}

export function AssignmentsTable(props: AssignmentsViewProps) {
  if (props.isPending) return <AssignmentsSkeleton table />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Task</th>
              <th scope="col" className="px-4 py-3 font-medium">Target</th>
              <th scope="col" className="px-4 py-3 font-medium">Teacher</th>
              <th scope="col" className="px-4 py-3 font-medium">Due date</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              {(props.canEdit || props.canPublish || props.canDelete) && (
                <th scope="col" className="w-36 px-4 py-3" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {props.items.map((assignment) => (
              <tr
                key={assignment.id}
                className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => props.onView(assignment)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{assignment.title}</p>
                  <p className="text-xs text-muted-foreground">{assignment.subjectCode} · {assignment.subjectName}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {assignment.className}
                  {assignment.sectionName ? ` · ${assignment.sectionName}` : ""}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{assignment.teacherName}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                  <span className="flex items-center gap-2">
                    {formatFullDate(assignment.dueDate)}
                    {assignment.isOverdue && assignment.status !== "ARCHIVED" && (
                      <Badge
                        variant="secondary"
                        className="border-transparent bg-red-50 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300"
                      >
                        Overdue
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <TaskStatusBadge status={assignment.status} />
                </td>
                {(props.canEdit || props.canPublish || props.canDelete) && (
                  <td className="px-4 py-3">
                    <RowActions {...props} assignment={assignment} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AssignmentsCards(props: AssignmentsViewProps) {
  if (props.isPending) return <AssignmentsSkeleton table={false} />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {props.items.map((assignment) => (
        <li key={assignment.id}>
          <button
            type="button"
            onClick={() => props.onView(assignment)}
            className="w-full rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
          >
            <span className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{assignment.title}</span>
                  <TaskStatusBadge status={assignment.status} />
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {assignment.subjectCode} · {assignment.className}
                  {assignment.sectionName ? ` · ${assignment.sectionName}` : ""}
                </span>
                <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">Due {formatFullDate(assignment.dueDate)}</span>
                  {assignment.isOverdue && assignment.status !== "ARCHIVED" && (
                    <Badge
                      variant="secondary"
                      className="border-transparent bg-red-50 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300"
                    >
                      Overdue
                    </Badge>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <RowActions {...props} assignment={assignment} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function RowActions({
  assignment,
  canEdit,
  canPublish,
  canDelete,
  onEdit,
  onPublish,
  onDelete,
}: {
  assignment: AssignmentListItem
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
  onEdit: (assignment: AssignmentListItem) => void
  onPublish: (assignment: AssignmentListItem) => void
  onDelete: (assignment: AssignmentListItem) => void
}) {
  const isDraft = assignment.status === "DRAFT"
  return (
    <div className="flex items-center justify-end gap-1">
      {canPublish && isDraft && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onPublish(assignment) }}
          aria-label={`Publish ${assignment.title}`}
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onEdit(assignment) }}
          aria-label={`Edit ${assignment.title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onDelete(assignment) }}
          aria-label={`Delete ${assignment.title}`}
          className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <CalendarClock className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No assignments found</p>
      <p className="text-sm text-muted-foreground">Create an assignment to assign it to a class and subject.</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load assignments.</p>
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

function AssignmentsSkeleton({ table }: { table: boolean }) {
  return (
    <div
      className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${table ? "hidden md:block" : "md:hidden"}`}
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}