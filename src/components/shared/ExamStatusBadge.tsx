import { Badge } from "@/components/ui/badge"
import { EXAM_STATUS_LABELS } from "@/types/exams"
import type { ExamStatus } from "@/types/exams"

const STATUS_STYLES: Record<ExamStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-500/15 dark:text-slate-300",
  PUBLISHED:
    "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  FINAL: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
  ARCHIVED: "bg-muted text-muted-foreground border-transparent",
}

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${STATUS_STYLES[status]}`}>
      {EXAM_STATUS_LABELS[status]}
    </Badge>
  )
}