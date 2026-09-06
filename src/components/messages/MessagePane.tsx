import { useEffect, useRef, useState } from "react"
import { Archive, ArrowLeft, Send } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { formatFullDate, getInitials } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ConversationDetail, MessageListItem } from "@/types/messages"

interface MessagePaneProps {
  conversation: ConversationDetail | undefined
  messages: MessageListItem[] | undefined
  isPending: boolean
  isError: boolean
  selfUserId: string
  onBack?: () => void
  onSend: (body: string) => void
  onArchive: () => void
  isSending: boolean
}

function bubbleTime(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(isoDate))
}

function MessageBubble({ message, isSelf }: { message: MessageListItem; isSelf: boolean }) {
  return (
    <div className={cn("flex w-full items-end gap-2", isSelf ? "justify-end" : "justify-start")}>
      {!isSelf && (
        <Avatar className="size-7 shrink-0">
          <AvatarFallback className="text-[10px]">{getInitials(message.senderName)}</AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          isSelf ? "rounded-br-sm bg-indigo-600 text-white" : "rounded-bl-sm bg-muted",
        )}
      >
        {!isSelf && <p className="mb-0.5 text-xs font-medium text-foreground">{message.senderName}</p>}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={cn(
            "mt-1 text-right text-[10px]",
            isSelf ? "text-indigo-200" : "text-muted-foreground",
            "tabular-nums",
          )}
        >
          {bubbleTime(message.createdAt)}
        </p>
      </div>
    </div>
  )
}

export function MessagePane({
  conversation,
  messages,
  isPending,
  isError,
  selfUserId,
  onBack,
  onSend,
  onArchive,
  isSending,
}: MessagePaneProps) {
  const [draft, setDraft] = useState("")
  const scrollAnchor = useRef<HTMLDivElement | null>(null)
  const ordered = messages?.slice().reverse() ?? []

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ block: "end" })
  }, [ordered.length])

  const sendDraft = () => {
    const body = draft.trim()
    if (!body) return
    onSend(body)
    setDraft("")
  }

  return (
    <div className="flex h-full flex-col">
      {conversation ? (
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {onBack && (
            <Button type="button" variant="ghost" size="icon-sm" className="sm:hidden" onClick={onBack}>
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Avatar className="size-9">
            <AvatarFallback>{getInitials(conversation.title ?? "Conversation")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {conversation.type === "GROUP" ? conversation.title ?? "Group conversation" : "Direct message"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {conversation.participants.map((participant) => participant.name).join(", ")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onArchive()
            }}
            title="Archive this conversation"
            aria-label="Archive this conversation"
          >
            <Archive className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="border-b px-4 py-3 text-sm font-semibold">Conversation</div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
          </div>
        ) : isError || !conversation ? (
          conversation ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Could not load this conversation.
            </p>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 pb-10 text-center">
              <p className="text-sm font-medium text-foreground">Nothing selected</p>
              <p className="text-xs text-muted-foreground">
                Pick a conversation from the list or start a new one.
              </p>
            </div>
          )
        ) : ordered.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Say hello to start the conversation.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {conversation.createdAt && (
              <p className="text-center text-[11px] text-muted-foreground">
                Started {formatFullDate(conversation.createdAt)}
              </p>
            )}
            {ordered.map((message) => (
              <MessageBubble key={message.id} message={message} isSelf={message.senderId === selfUserId} />
            ))}
            <div ref={scrollAnchor} />
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          sendDraft()
        }}
        className="flex items-end gap-2 border-t p-3"
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={conversation ? "Type a message…" : "Select a conversation to reply"}
          disabled={!conversation}
          maxLength={4000}
          rows={1}
          className="max-h-32 min-h-10 resize-none"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              sendDraft()
            }
          }}
        />
        <Button type="submit" size="icon" disabled={!conversation || !draft.trim() || isSending} aria-label="Send message">
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  )
}