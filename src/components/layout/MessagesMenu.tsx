import { useNavigate } from "react-router-dom"
import { Mail } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { useConversations, useUnreadCount } from "@/hooks/useMessages"
import { conversationDisplayTitle } from "@/types/messages"
import { timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function MessagesMenu() {
  const { user, can } = useAuth()
  const navigate = useNavigate()
  const { data: unread } = useUnreadCount()
  const { data: previews } = useConversations({ page: 1, pageSize: 5 })

  if (!can("messages:view")) return null

  const totalUnread = unread?.total ?? 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hidden sm:inline-flex"
          aria-label="Messages"
        >
          <Mail className="size-5" aria-hidden="true" />
          {totalUnread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-80 sm:min-w-96">
        <DropdownMenuLabel className="px-2 py-1.5">
          Messages
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
              No messages yet.
            </p>
          ) : (
            previews.items.map((conversation) => (
              <DropdownMenuItem
                key={conversation.id}
                className="flex flex-col items-start gap-1 py-2.5"
                onSelect={() => navigate(`/messages?chat=${conversation.id}`)}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {conversationDisplayTitle(conversation, user?.id ?? "")}
                  </span>
                  {conversation.lastMessageAt && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(conversation.lastMessageAt)}
                    </span>
                  )}
                </span>
                <span className="line-clamp-1 text-xs text-muted-foreground/80">
                  {conversation.lastMessagePreview ?? "No messages yet"}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/messages")}>View all messages</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}