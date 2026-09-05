import { useMemo, useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
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
import { useAttendance } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import type { AttendancePeriod } from "@/types/dashboard"

const PERIODS: { value: AttendancePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
]

const DONUT_COLORS = {
  present: "#10b981",
  late: "#f59e0b",
  absent: "#ef4444",
} as const

interface AttendanceOverviewProps {
  className?: string
}

export function AttendanceOverview({ className }: AttendanceOverviewProps) {
  const [period, setPeriod] = useState<AttendancePeriod>("today")
  const { data, isPending, isError } = useAttendance(period)

  const pieData = useMemo(() => {
    if (!data) return []
    return [
      { name: "Present", value: data.present, color: DONUT_COLORS.present },
      { name: "Late", value: data.late, color: DONUT_COLORS.late },
      { name: "Absent", value: data.absent, color: DONUT_COLORS.absent },
    ]
  }, [data])

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Attendance Overview</CardTitle>
        <CardDescription data-slot="card-description">
          {PERIODS.find((option) => option.value === period)?.label} snapshot
        </CardDescription>
        <CardAction>
          <Tabs value={period} onValueChange={(value) => setPeriod(value as AttendancePeriod)}>
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
      <CardContent className="flex flex-1 flex-col">
        {isPending && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
            <Skeleton className="size-44 rounded-full" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        )}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load attendance. Please try again.
          </div>
        )}

        {data && data.total === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            No attendance records in this period yet.
          </div>
        )}

        {data && data.total > 0 && (
          <>
            <div className="relative mx-auto my-2 h-48 w-full max-w-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="72%"
                    outerRadius="96%"
                    paddingAngle={2}
                    cornerRadius={4}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<ChartTooltip formatter={(value) => String(value)} />}
                    cursor={false}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatPercent(data.average)}
                </span>
                <span className="text-xs text-muted-foreground">Attendance</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t pt-4">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex flex-col items-center text-center">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden="true"
                    />
                    {entry.name}
                  </span>
                  <span className="mt-1 text-lg font-semibold tabular-nums">{entry.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}