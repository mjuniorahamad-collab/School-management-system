import { usePortalTasks } from "@/hooks/usePortal"
import { formatFullDate } from "@/lib/format"
import { TaskKindBadge, TaskStatusBadge } from "@/components/portal/PortalBadges"
import type { PortalTaskView } from "@/types/portal"

export function TasksSection({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = usePortalTasks(studentId)

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-muted" />
  }
  if (isError || !data) {
    return <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Could not load tasks.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{data.session.name}</span>
        <span>
          {data.student.name} · {data.student.admissionNumber}
        </span>
      </div>

      {data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No homework or assignments have been published yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((task: PortalTaskView) => (
            <li key={task.id} className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <TaskKindBadge kind={task.kind} />
                  <TaskStatusBadge status={task.status} />
                  <span className="text-xs font-medium text-muted-foreground">{task.subjectName}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{task.title}</p>
                {task.instructions && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{task.instructions}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
                <p className="text-xs text-muted-foreground">
                  Due <span className="font-medium tabular-nums text-foreground">{formatFullDate(task.dueDate)}</span>
                </p>
                {task.submission ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Submitted {formatFullDate(task.submission.submittedAt)}
                    {task.submission.marks !== null ? ` · ${task.submission.marks} marks` : ""}
                  </p>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground">Not submitted yet</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}