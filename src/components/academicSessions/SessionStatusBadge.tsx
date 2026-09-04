import { Badge } from "@/components/ui/badge"
import type { AcademicSessionStatus } from "@/types/academicSessions"

const STATUS_STYLES: Record<AcademicSessionStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
  UPCOMING: "bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/20",
  CLOSED: "bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:hover:bg-slate-500/20",
}

export function SessionStatusBadge({ status }: { status: AcademicSessionStatus }) {
  return (
    <Badge variant="secondary" className={STATUS_STYLES[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </Badge>
  )
}
