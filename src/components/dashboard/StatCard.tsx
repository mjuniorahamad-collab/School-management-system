import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { TrendTone } from "@/types"
import type { DashboardStatItem, DashboardStatTone } from "@/types/dashboard"

const toneStyles: Record<DashboardStatTone, string> = {
  primary: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
}

function trendMeta(trend: number): { tone: TrendTone; arrow: typeof ArrowUpRight; className: string } {
  if (trend >= 0) {
    return {
      tone: "positive",
      arrow: ArrowUpRight,
      className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300",
    }
  }
  return {
    tone: "negative",
    arrow: ArrowDownRight,
    className: "text-red-600 bg-red-50 dark:bg-red-500/15 dark:text-red-300",
  }
}

interface StatCardProps {
  stat: DashboardStatItem
  presentation?: { icon: LucideIcon; tone: DashboardStatTone }
}

export function StatCard({ stat, presentation }: StatCardProps) {
  const Icon = presentation?.icon
  const tone = presentation?.tone ?? "primary"
  const trend = trendMeta(stat.trendPercent)
  const TrendArrow = trend.arrow

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.75rem]">
            {stat.value}
          </p>
        </div>
        {Icon && (
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneStyles[tone])}>
            <Icon className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
            trend.className,
          )}
        >
          <TrendArrow className="size-3.5" aria-hidden="true" />
          {trend.tone === "positive" ? "+" : ""}
          {stat.trendPercent}%
        </span>
        <span className="text-muted-foreground">{stat.comparison}</span>
      </div>
    </Card>
  )
}