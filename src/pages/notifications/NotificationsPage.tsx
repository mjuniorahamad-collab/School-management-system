import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CheckCheck, ChevronLeft, ChevronRight, Send } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { NotificationFeed } from "@/components/notifications/NotificationFeed"
import { NewNotificationDialog } from "@/components/notifications/NewNotificationDialog"
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationCount,
  useNotifications,
} from "@/hooks/useNotifications"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { NotificationFilter, NotificationListItem } from "@/types/notifications"

const PAGE_SIZE = 20

export function NotificationsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [composeOpen, setComposeOpen] = useState(false)

  const filter = (searchParams.get("filter") as NotificationFilter | null) ?? "all"
  const page = Math.max(1, Number(searchParams.get("page")) || 1)

  const { data, isPending, isError, refetch } = useNotifications({ page, pageSize: PAGE_SIZE, filter })
  const { data: unread } = useNotificationCount()

  const totalUnread = unread?.total ?? 0
  const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)), [data])

  const readMutation = useMarkNotificationRead()
  const markAllMutation = useMarkAllNotificationsRead()
  const canCreate = can("notifications:create")

  const updateParams = (patch: Record<string, string | null>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "all" || value === "1") next.delete(key)
        else next.set(key, value)
      }
      return next
    })
  }

  const handleOpen = (item: NotificationListItem) => {
    if (!item.readAt) {
      readMutation.mutate(item.id, {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not mark as read."),
      })
    }
    if (item.linkPath) navigate(item.linkPath)
  }

  const handleMarkAllRead = () => {
    markAllMutation.mutate(undefined, {
      onSuccess: () => toast.success("All notifications marked as read"),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not mark all as read."),
    })
  }

  const hasUnreadInView = filter === "unread" ? (data?.items.length ?? 0) > 0 : totalUnread > 0

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Fee activity, portal events, and announcements."
        actions={
          canCreate ? (
            <Button type="button" onClick={() => setComposeOpen(true)}>
              <Send className="size-4" aria-hidden="true" />
              Send notification
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => updateParams({ filter: value, page: null })}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread{totalUnread > 0 ? ` (${totalUnread})` : ""}</TabsTrigger>
          </TabsList>
        </Tabs>

        {hasUnreadInView && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={markAllMutation.isPending}>
            <CheckCheck className="size-4" aria-hidden="true" />
            Mark all as read
          </Button>
        )}
      </div>

      <NotificationFeed
        items={data?.items ?? []}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
        onOpen={handleOpen}
      />

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 border-t pt-4" aria-label="Notifications pagination">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(Math.max(1, page - 1)) })}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Button>
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(Math.min(totalPages, page + 1)) })}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </nav>
      )}

      <NewNotificationDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </PageContainer>
  )
}