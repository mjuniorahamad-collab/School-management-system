import { useNavigate } from "react-router-dom"
import { Bell } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { useNotificationCount, useNotifications } from "@/hooks/useNotifications"
import { notificationToneFor } from "@/types/notifications"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function NotificationsMenu() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const { data: unread } = useNotificationCount()
  const { data: previews } = useNotifications({ page: 1, pageSize: 5 })

  if (!can("notifications:view")) return null

  const totalUnread = unread?.total ?? 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" aria-hidden="true" />
          {totalUnread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-80 sm:min-w-96">
        <DropdownMenuLabel className="px-2 py-1.5">
          Notifications
          {totalUnread > 0 && (
            <>
              {" "}
              <span className="font-normal text-muted-foreground">· {totalUnread} unread</span>
            </>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {!previews || previews.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            previews.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="flex items-start gap-3 py-2.5 align-top"
                onSelect={(event) => {
                  event.preventDefault()
                  navigate(item.linkPath ? item.linkPath : "/notifications")
                }}
              >
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", notificationToneFor(item.type))}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {item.body && <span className="block truncate text-xs text-muted-foreground">{item.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                    {timeAgo(item.createdAt)}
                  </span>
                </span>
                {!item.readAt && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/notifications")}>View all notifications</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}