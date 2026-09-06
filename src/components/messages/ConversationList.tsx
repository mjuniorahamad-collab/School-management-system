import { MessageSquarePlus } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo, getInitials } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  conversationDisplaySubtitle,
  conversationDisplayTitle,
  type ConversationListItem,
} from "@/types/messages"

interface ConversationListProps {
  conversations: ConversationListItem[] | undefined
  isPending: boolean
  isError: boolean
  activeId: string | null
  selfUserId: string
  onSelect: (conversationId: string) => void
  onCompose: () => void
}

export function ConversationList({
  conversations,
  isPending,
  isError,
  activeId,
  selfUserId,
  onSelect,
  onCompose,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="text-sm font-semibold">Inbox</p>
        <Button type="button" variant="outline" size="sm" onClick={onCompose}>
          <MessageSquarePlus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">New message</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isPending ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Could not load your conversations.
          </p>
        ) : !conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground">
              Start a direct message or a group to reach staff and parents.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {conversations.map((conversation) => {
              const active = conversation.id === activeId
              const unread = conversation.unreadCount > 0
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-accent/50",
                      active && "bg-accent",
                    )}
                    onClick={() => onSelect(conversation.id)}
                  >
                    <Avatar className="size-10">
                      <AvatarFallback>{getInitials(conversationDisplayTitle(conversation, selfUserId))}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {conversationDisplayTitle(conversation, selfUserId)}
                        </span>
                        {conversation.lastMessageAt && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {timeAgo(conversation.lastMessageAt)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {conversationDisplaySubtitle(conversation, selfUserId)}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "block truncate text-xs",
                            unread ? "font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {conversation.lastMessagePreview
                            ? conversation.lastMessagePreview
                            : "No messages yet"}
                        </span>
                        {unread && (
                          <Badge variant="secondary" className="shrink-0 rounded-full px-1.5 text-[11px]">
                            {conversation.unreadCount}
                          </Badge>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}