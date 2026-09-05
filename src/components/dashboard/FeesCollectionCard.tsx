import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowUpRight } from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartTooltip } from "@/components/charts/ChartTooltip"
import { useFeeAnalytics } from "@/hooks/useDashboardData"
import { useTheme } from "@/theme/useTheme"
import { cn } from "@/lib/utils"
import { formatINR, formatINRCompact } from "@/lib/format"
import type { FeePeriod } from "@/types/dashboard"

const PERIODS: { value: FeePeriod; label: string }[] = [
  { value: "month", label: "This Month" },
  { value: "session", label: "This Session" },
  { value: "year", label: "This Year" },
]

const BAR_COLOR = "#4f46e5"

const CHART_COLORS = {
  light: {
    grid: "#eef2f7",
    tick: "#64748b",
    tickMuted: "#94a3b8",
    cursor: "hsl(222 47% 11% / 0.04)",
  },
  dark: {
    grid: "oklch(1 0 0 / 10%)",
    tick: "oklch(0.704 0.04 256.788)",
    tickMuted: "oklch(0.704 0.04 256.788 / 0.8)",
    cursor: "oklch(1 0 0 / 0.06)",
  },
}

interface FeesCollectionCardProps {
  className?: string
}

export function FeesCollectionCard({ className }: FeesCollectionCardProps) {
  const [period, setPeriod] = useState<FeePeriod>("session")
  const { data, isPending, isError } = useFeeAnalytics(period)
  const { isDark } = useTheme()
  const colors = CHART_COLORS[isDark ? "dark" : "light"]

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Fees Collection</CardTitle>
        <CardDescription data-slot="card-description">
          Collection trend
        </CardDescription>
        <CardAction>
          <Tabs value={period} onValueChange={(value) => setPeriod(value as FeePeriod)}>
            <TabsList>
              {PERIODS.map((option) => (
                <TabsTrigger key={option.value} value={option.value} className="px-2.5 text-xs">
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>

      {isPending && (
        <CardContent className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-44 w-full" />
        </CardContent>
      )}

      {isError && (
        <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Could not load fee analytics. Please try again.
        </CardContent>
      )}

      {data && (
        <CardContent className="flex flex-1 flex-col">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Collected</p>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatINR(data.totalCollected)}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                +{data.trendPercent}%
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.comparison}</p>
          </div>

          <div className="mt-4 h-48 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.months}
                margin={{ top: 8, right: 4, bottom: 0, left: -8 }}
                barCategoryGap="28%"
              >
                <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: colors.tick }}
                  dy={6}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11, fill: colors.tickMuted }}
                  tickFormatter={(value: number) => formatINRCompact(value)}
                />
                <Tooltip
                  content={<ChartTooltip formatter={(value) => formatINR(value)} />}
                  cursor={{ fill: colors.cursor }}
                />
                <Bar dataKey="collected" fill={BAR_COLOR} radius={[6, 6, 2, 2]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      )}
    </Card>
  )
}