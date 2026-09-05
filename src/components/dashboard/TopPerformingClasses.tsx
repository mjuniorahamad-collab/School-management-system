import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useTopPerformingClasses } from "@/hooks/useDashboardData"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

const rankStyles: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  2: "bg-slate-200 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  3: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
}

interface TopPerformingClassesProps {
  className?: string
}

export function TopPerformingClasses({ className }: TopPerformingClassesProps) {
  const { data, isPending, isError } = useTopPerformingClasses()
  const classes = data?.classes ?? []
  const context = data?.context

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Top Performing Classes</CardTitle>
        <CardDescription data-slot="card-description">
          {context
            ? `${context.examName ?? "Latest exam"} · ${context.academicSessionName}`
            : "Average score in a comparable finalized exam"}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/results">
              Details
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isPending &&
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b py-3 last:border-0">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-1.5 w-full" />
              </div>
              <Skeleton className="h-4 w-10" />
            </div>
          ))}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load class performance. Please try again.
          </div>
        )}

        {data && classes.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            No comparable finalized exam yet.
          </div>
        )}

        {classes.length > 0 && (
          <ul className="divide-y">
            {classes.map((entry) => (
              <li key={entry.rank} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    rankStyles[entry.rank] ?? "bg-muted text-muted-foreground",
                  )}
                  aria-label={`Rank ${entry.rank}`}
                >
                  {entry.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{entry.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatPercent(entry.performance)}
                    </p>
                  </div>
                  <Progress
                    value={entry.performance}
                    className="mt-1.5 h-1.5"
                    indicatorClassName="bg-indigo-500"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter className="justify-center border-t pt-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/results">
            View all results
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}