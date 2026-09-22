import { Badge } from "@/components/ui/badge"
import { formatINR } from "@/lib/format"
import { ADJUSTMENT_STATUS_LABELS } from "@/types/concessions"
import type { AdjustmentKind, AdjustmentStatus } from "@/types/concessions"

const STATUS_STYLES: Record<AdjustmentStatus, string> = {
  REQUESTED: "bg-amber-50 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-300",
  APPROVED: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  REJECTED: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
  CANCELLED: "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-500/15 dark:text-slate-300",
  REVERSED: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
}

export function ConcessionStatusBadge({ status }: { status: AdjustmentStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${STATUS_STYLES[status]}`}>
      {ADJUSTMENT_STATUS_LABELS[status]}
    </Badge>
  )
}

/** The concession's requested value: monetary for fixed amounts, % for percentages. */
export function ConcessionValueLabel({ kind, value }: { kind: AdjustmentKind; value: number }) {
  if (kind === "PERCENTAGE") {
    return <span className="text-sm text-foreground tabular-nums">{value}%</span>
  }
  return <span className="text-sm text-foreground tabular-nums">{formatINR(value)}</span>
}