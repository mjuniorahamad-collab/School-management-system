import { CalendarDays, MapPin, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { formatFullDate } from "@/lib/format"
import type { EventCategory, EventListItem, EventStatus } from "@/types/communication"

const statusStyles: Record<EventStatus, string> = {
  SCHEDULED:
    "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
  ONGOING: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  COMPLETED: "bg-muted text-muted-foreground border-transparent",
  CANCELLED: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
}

const categoryLabels: Record<EventCategory, string> = {
  GENERAL: "General",
  ACADEMIC: "Academic",
  SPORTS: "Sports",
  CULTURAL: "Cultural",
  COMMUNITY: "Community",
}

interface EventsViewProps {
  items: EventListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canDelete: boolean
  onRetry: () => void
  onEdit: (event: EventListItem) => void
  onDelete: (event: EventListItem) => void
}

export function EventsTable(props: EventsViewProps) {
  if (props.isPending) return <EventSkeleton table />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Event</th>
              <th scope="col" className="px-4 py-3 font-medium">Category</th>
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              {(props.canEdit || props.canDelete) && (
                <th scope="col" className="w-24 px-4 py-3" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {props.items.map((event) => (
              <tr key={event.id} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <span className="font-medium text-foreground">{event.title}</span>
                  {event.location && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" aria-hidden="true" />
                      {event.location}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {categoryLabels[event.category as EventCategory] ?? event.category}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatFullDate(event.startAt)}
                </td>
                <td className="px-4 py-3">
                  <EventStatusBadge status={event.status as EventStatus} />
                </td>
                {(props.canEdit || props.canDelete) && (
                  <td className="px-4 py-3">
                    <RowActions {...props} event={event} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function EventsCards(props: EventsViewProps) {
  if (props.isPending) return <EventSkeleton table={false} />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {props.items.map((event) => (
        <li key={event.id}>
          <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{event.title}</span>
                <EventStatusBadge status={event.status as EventStatus} />
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {formatFullDate(event.startAt)} ·{" "}
                {categoryLabels[event.category as EventCategory] ?? event.category}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <RowActions {...props} event={event} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function RowActions({
  event,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  event: EventListItem
  canEdit: boolean
  canDelete: boolean
  onEdit: (event: EventListItem) => void
  onDelete: (event: EventListItem) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(event)}
          aria-label={`Edit ${event.title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(event)}
          aria-label={`Delete ${event.title}`}
          className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${statusStyles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <CalendarDays className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No events found</p>
      <p className="text-sm text-muted-foreground">Schedule an event to populate the school calendar.</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load events.</p>
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

function EventSkeleton({ table }: { table: boolean }) {
  return (
    <div
      className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${table ? "hidden md:block" : "md:hidden"}`}
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
