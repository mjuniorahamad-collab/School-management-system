import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { DashboardStat, TrendTone } from "@/types"

const toneStyles: Record<DashboardStat["tone"], string> = {
  primary: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
}

function trendMeta(trend: number): { tone: TrendTone; arrow: typeof ArrowUpRight; className: string } {
  if (trend >= 0) {
    return {
      tone: "positive",
      arrow: ArrowUpRight,
      className: "text-emerald-600 bg-emerald-50",
    }
  }
  return {
    tone: "negative",
    arrow: ArrowDownRight,
    className: "text-red-600 bg-red-50",
  }
}

export function StatCard({ stat }: { stat: DashboardStat }) {
  const Icon = stat.icon
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
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneStyles[stat.tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
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