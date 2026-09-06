import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Shared presentational helpers for the Reports module. Tables, pagination and
// summary cards stay consistent with the rest of the dashboard.

const STATUS_TONES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  CONVERTED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PAID: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  APPROVED: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  TRANSFERRED: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  PENDING: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PARTIAL: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  WITHDRAWN: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  REJECTED: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  OVERDUE: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  UNPAID: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_TONES[status] ?? STATUS_TONES.INACTIVE
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", style)}>
      {label}
    </Badge>
  )
}

export interface ReportStat {
  label: string
  value: string
  tone?: "default" | "positive" | "warning" | "negative"
}

const STAT_TONES: Record<NonNullable<ReportStat["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  negative: "text-red-600 dark:text-red-400",
}

export function ReportStatGrid({ stats }: { stats: ReportStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className="text-xs font-medium text-muted-foreground uppercase">{stat.label}</p>
          <p className={cn("mt-0.5 truncate text-lg font-semibold tabular-nums", STAT_TONES[stat.tone ?? "default"])}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  )
}

export function ResultsPagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Page {page} of {totalPages} · {total} record{total !== 1 ? "s" : ""}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded px-2 py-1 font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          ← Prev
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded px-2 py-1 font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

export function ReportEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load this report.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Try again
      </button>
    </div>
  )
}

export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function humanizeToken(token: string): string {
  return token.replaceAll("_", " ").toLowerCase()
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}