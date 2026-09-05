import { Badge } from "@/components/ui/badge"
import type { MembershipStatus } from "@/types/users"

const STATUS_STYLES: Record<MembershipStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
}

const STATUS_DOT: Record<MembershipStatus, string> = {
  ACTIVE: "bg-emerald-500",
  INACTIVE: "bg-slate-400",
}

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
  return (
    <Badge variant="outline" className={`gap-1.5 ${STATUS_STYLES[status]}`}>
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {label}
    </Badge>
  )
}