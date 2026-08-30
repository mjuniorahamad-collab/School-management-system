import { Badge } from "@/components/ui/badge"
import type { StudentStatus } from "@/types/students"

const STATUS_STYLES: Record<StudentStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-600",
  TRANSFERRED: "bg-sky-50 text-sky-700",
  WITHDRAWN: "bg-amber-50 text-amber-700",
  GRADUATED: "bg-indigo-50 text-indigo-700",
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