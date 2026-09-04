import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { useFeeCollectionStatus } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"
import { formatINR, formatPercent } from "@/lib/format"

interface FeeCollectionStatusProps {
  className?: string
}

export function FeeCollectionStatus({ className }: FeeCollectionStatusProps) {
  const { data, isPending, isError } = useFeeCollectionStatus()

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Fee Collection Status</CardTitle>
        <CardDescription data-slot="card-description">Current session realization</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isPending && (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-3 w-full" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
        )}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load fee status.
          </div>
        )}

        {data && (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[1.75rem] font-semibold tracking-tight tabular-nums">
                  {formatINR(data.collected)}
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {formatPercent((data.collected / data.total) * 100, 0)} collected
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">of {formatINR(data.total)} goal</p>
            </div>

            <Progress
              value={(data.collected / data.total) * 100}
              className="h-2.5"
              indicatorClassName="bg-emerald-500"
            />

            <dl className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Collected</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">{formatINR(data.collected)}</dd>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Pending</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">{formatINR(data.pending)}</dd>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">{formatINR(data.total)}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  )
}