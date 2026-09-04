import { Link } from "react-router-dom"
import { ArrowRight, Megaphone } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useImportantNotices } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import type { NoticePriority } from "@/types"

const priorityMeta: Record<NoticePriority, { label: string; dot: string }> = {
  high: { label: "High priority", dot: "bg-red-500" },
  medium: { label: "Medium priority", dot: "bg-amber-500" },
  low: { label: "Low priority", dot: "bg-slate-400" },
}

interface ImportantNoticesProps {
  className?: string
}

export function ImportantNotices({ className }: ImportantNoticesProps) {
  const { data, isPending, isError } = useImportantNotices()

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Important Notices</CardTitle>
        <CardDescription data-slot="card-description">Latest communications</CardDescription>
        <CardAction>
          <span className="hidden items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 sm:inline-flex dark:bg-indigo-500/15 dark:text-indigo-300">
            <Megaphone className="size-3.5" aria-hidden="true" />
            {data?.length ?? 0} active
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isPending &&
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border-b py-3 last:border-0">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-3 h-3 w-20" />
            </div>
          ))}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load notices.
          </div>
        )}

        {data && (
          <ul className="divide-y">
            {data.map((notice) => {
              const meta = priorityMeta[notice.priority]
              return (
                <li key={notice.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${meta.dot}`}
                      title={meta.label}
                      aria-label={meta.label}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{notice.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {notice.summary}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                        {timeAgo(notice.publishedAt)}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <CardFooter className="justify-center border-t pt-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/notices">
            View All Notices
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}