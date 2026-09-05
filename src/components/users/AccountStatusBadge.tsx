import { Badge } from "@/components/ui/badge"
import type { UserAccountStatus } from "@/types/users"

const STATUS_STYLES: Record<UserAccountStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  SUSPENDED: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
}

const STATUS_DOT: Record<UserAccountStatus, string> = {
  ACTIVE: "bg-emerald-500",
  INACTIVE: "bg-slate-400",
  SUSPENDED: "bg-red-500",
}

export function AccountStatusBadge({ status }: { status: UserAccountStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
  return (
    <Badge variant="outline" className={`gap-1.5 ${STATUS_STYLES[status]}`}>
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {label}
    </Badge>
  )
}