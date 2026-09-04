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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useUpcomingEvents } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"
import { formatDateDay, formatDateMonth } from "@/lib/format"
import type { EventCategory } from "@/types"

const categoryMeta: Record<EventCategory, { label: string; className: string }> = {
  sports: { label: "Sports", className: "bg-amber-50 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-300" },
  academic: { label: "Academic", className: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300" },
  community: { label: "Community", className: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300" },
}

function filterUpcoming(eventDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(eventDate)
  date.setHours(0, 0, 0, 0)
  return date.getTime() >= today.getTime()
}

interface UpcomingEventsProps {
  className?: string
}

export function UpcomingEvents({ className }: UpcomingEventsProps) {
  const { data, isPending, isError } = useUpcomingEvents()
  const events = data?.filter((event) => filterUpcoming(event.date))

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Upcoming Events</CardTitle>
        <CardDescription data-slot="card-description">School calendar highlights</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/events">
              View all
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isPending &&
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b py-3 last:border-0">
              <Skeleton className="size-12 rounded-xl" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load events.
          </div>
        )}

        {events && events.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            No upcoming events.
          </div>
        )}

        {events && events.length > 0 && (
          <ul className="divide-y">
            {events.map((event) => {
              const meta = categoryMeta[event.category]
              return (
                <li key={event.id} className="flex items-center gap-3 py-3">
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border bg-muted/40">
                    <span className="text-sm font-semibold leading-none tabular-nums">
                      {formatDateDay(event.date)}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                      {formatDateMonth(event.date)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.time}</p>
                  </div>
                  <Badge variant="secondary" className={`hidden sm:inline-flex font-medium ${meta.className}`}>
                    {meta.label}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <CardFooter className="justify-center border-t pt-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/events">
            View All Events
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}