import { Badge } from "@/components/ui/badge"
import type { EmployeeStatus } from "@/types/teachers"

const STATUS_STYLES: Record<EmployeeStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  ON_LEAVE: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
}

const STATUS_DOT: Record<EmployeeStatus, string> = {
  ACTIVE: "bg-emerald-500",
  INACTIVE: "bg-slate-400",
  ON_LEAVE: "bg-amber-500",
}

export function TeacherStatusBadge({ status }: { status: EmployeeStatus }) {
  const label = status === "ON_LEAVE" ? "On Leave" : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
  return (
    <Badge variant="outline" className={`gap-1.5 ${STATUS_STYLES[status]}`}>
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {label}
    </Badge>
  )
}
