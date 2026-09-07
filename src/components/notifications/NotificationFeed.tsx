import { Banknote, ExternalLink, Megaphone, Receipt, RefreshCw } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { formatFullDate } from "@/lib/format"
import {
  notificationToneFor,
  notificationTypeLabel,
  type NotificationListItem,
} from "@/types/notifications"
import { cn } from "@/lib/utils"

const typeIcons = {
  FEE_INVOICE: Receipt,
  FEE_PAYMENT: Banknote,
  PORTAL_LINK: ExternalLink,
  ADMIN: Megaphone,
} as const

const typeStyles = {
  FEE_INVOICE: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  FEE_PAYMENT: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PORTAL_LINK: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  ADMIN: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
} as const

interface NotificationFeedProps {
  items: NotificationListItem[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (item: NotificationListItem) => void
}

export function NotificationFeed({ items, isPending, isError, onRetry, onOpen }: NotificationFeedProps) {
  if (isPending) return <FeedSkeleton />
  if (isError) return <ErrorState onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <NotificationCard key={item.id} item={item} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function NotificationCard({ item, onOpen }: { item: NotificationListItem; onOpen: (item: NotificationListItem) => void }) {
  const Icon = typeIcons[item.type]
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          !item.readAt && "border-l-2 border-l-primary",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            typeStyles[item.type],
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
            <span className="text-[11px] font-medium text-muted-foreground uppercase">
              {notificationTypeLabel(item.type)}
            </span>
          </span>
          {item.body && (
            <span className="mt-0.5 block text-sm text-muted-foreground">{item.body}</span>
          )}
          <span className="mt-1.5 flex items-center gap-2">
            <span
              className={cn("size-1.5 rounded-full", notificationToneFor(item.type))}
              aria-hidden="true"
            />
            <span className="text-[11px] text-muted-foreground/70">
              {formatFullDate(item.createdAt)}
            </span>
          </span>
        </span>
        {!item.readAt && (
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
        )}
      </button>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <Megaphone className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No notifications</p>
      <p className="text-sm text-muted-foreground">
        New fee invoices, payments, and announcements will show up here.
      </p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load notifications.</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}