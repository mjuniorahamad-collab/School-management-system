import { Badge } from "@/components/ui/badge"
import type { AdmissionApplicationStatus } from "@/types/admissions"

const STYLES: Record<AdmissionApplicationStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  REJECTED: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  WITHDRAWN: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  CONVERTED: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
}

const DOTS: Record<AdmissionApplicationStatus, string> = {
  PENDING: "bg-amber-500",
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  WITHDRAWN: "bg-slate-400",
  CONVERTED: "bg-sky-500",
}

const LABELS: Record<AdmissionApplicationStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  CONVERTED: "Converted",
}

export function AdmissionStatusBadge({ status }: { status: AdmissionApplicationStatus }) {
  return (
    <Badge variant="outline" className={`gap-1.5 ${STYLES[status]}`}>
      <span className={`size-1.5 rounded-full ${DOTS[status]}`} aria-hidden="true" />
      {LABELS[status]}
    </Badge>
  )
}
