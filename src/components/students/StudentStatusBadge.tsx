import { Badge } from "@/components/ui/badge"
import type { StudentStatus } from "@/types/students"

const STATUS_STYLES: Record<StudentStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  TRANSFERRED: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  WITHDRAWN: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  GRADUATED: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
}

const STATUS_DOT: Record<StudentStatus, string> = {
  ACTIVE: "bg-emerald-500",
  INACTIVE: "bg-slate-400",
  TRANSFERRED: "bg-sky-500",
  WITHDRAWN: "bg-amber-500",
  GRADUATED: "bg-indigo-500",
}

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
  return (
    <Badge variant="outline" className={`gap-1.5 ${STATUS_STYLES[status]}`}>
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {label}
    </Badge>
  )
}