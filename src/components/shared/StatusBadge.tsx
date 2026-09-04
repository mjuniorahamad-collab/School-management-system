import { Badge } from "@/components/ui/badge"
import type { AttendanceStatus } from "@/types"

const statusStyles: Record<
  AttendanceStatus,
  { label: string; className: string; dot: string }
> = {
  present: {
    label: "Present",
    className: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  late: {
    label: "Late",
    className: "bg-amber-50 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  absent: {
    label: "Absent",
    className: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
    dot: "bg-red-500",
  },
}

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const style = statusStyles[status]
  return (
    <Badge variant="secondary" className={`gap-1.5 font-medium ${style.className}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </Badge>
  )
}