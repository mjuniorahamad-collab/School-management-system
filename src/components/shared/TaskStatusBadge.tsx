import { Badge } from "@/components/ui/badge"
import { TASK_STATUS_LABELS } from "@/types/homework"
import type { TaskStatus } from "@/types/homework"

const STATUS_STYLES: Record<TaskStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-500/15 dark:text-slate-300",
  PUBLISHED:
    "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  ARCHIVED: "bg-muted text-muted-foreground border-transparent",
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${STATUS_STYLES[status]}`}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  )
}