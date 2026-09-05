import {
  CircleCheck,
  CircleAlert,
  FileText,
  Info,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useRecentActivities } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import type { DashboardActivityTone } from "@/types/dashboard"

const toneIcon: Record<DashboardActivityTone, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
  info: { icon: Info, className: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  warning: { icon: CircleAlert, className: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" },
  neutral: { icon: FileText, className: "bg-muted text-muted-foreground" },
}

interface RecentActivityProps {
  className?: string
}

export function RecentActivity({ className }: RecentActivityProps) {
  const { data, isPending, isError } = useRecentActivities()

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription data-slot="card-description">Latest actions across the school</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isPending &&
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b py-3 last:border-0">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load activity.
          </div>
        )}

        {data && (
          <ul className="divide-y">
            {data.map((item) => {
              const meta = toneIcon[item.tone]
              const Icon = meta.icon
              return (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.className}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.action}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.entity}</p>
                  </div>
                  <time
                    className="shrink-0 text-xs text-muted-foreground/70"
                    dateTime={item.timestamp}
                  >
                    {timeAgo(item.timestamp)}
                  </time>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}