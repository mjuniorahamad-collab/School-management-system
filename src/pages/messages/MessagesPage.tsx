import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/PageHeader"
import { ConversationList } from "@/components/messages/ConversationList"
import { ComposeDialog } from "@/components/messages/ComposeDialog"
import { MessagePane } from "@/components/messages/MessagePane"
import {
  useArchiveConversation,
  useConversation,
  useConversations,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
} from "@/hooks/useMessages"
import { useAuth } from "@/auth/useAuth"

export function MessagesPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [composeOpen, setComposeOpen] = useState(false)

  const selectedId = searchParams.get("chat")
  const conversationsQuery = useConversations({ page: 1, pageSize: 30 })
  const conversationQuery = useConversation(selectedId)
  const messagesQuery = useMessages(selectedId, { page: 1, pageSize: 30 })
  const markRead = useMarkConversationRead()
  const sendMutation = useSendMessage()
  const archiveMutation = useArchiveConversation()

  const selectedConversation = selectedId ? conversationQuery.data : undefined

  useEffect(() => {
    if (selectedConversation && selectedConversation.unreadCount > 0 && !markRead.isPending) {
      markRead.mutate(selectedConversation.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id, selectedConversation?.unreadCount])

  if (!user) return null

  const selectConversation = (conversationId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set("chat", conversationId)
      return next
    })
  }

  const clearSelection = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete("chat")
      return next
    })
  }

  const handleArchive = () => {
    if (!selectedId) return
    archiveMutation.mutate(selectedId, {
      onSuccess: () => {
        clearSelection()
        toast.success("Conversation archived")
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Could not archive this conversation.")
      },
    })
  }

  const handleSend = (body: string) => {
    if (!selectedId) return
    sendMutation.mutate(
      { conversationId: selectedId, body },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Could not send the message.")
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Messages" description="Direct threads and group conversations with staff and parents." />
      <div className="h-[calc(100vh-15rem)] min-h-[28rem] overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-foreground/10 lg:h-[calc(100vh-13rem)]">
        <div className="grid h-full sm:grid-cols-[minmax(15rem,22rem)_1fr]">
          <div className={selectedId ? "hidden sm:block sm:border-r" : "border-r"}>
            <ConversationList
              conversations={conversationsQuery.data?.items}
              isPending={conversationsQuery.isPending}
              isError={conversationsQuery.isError}
              activeId={selectedId}
              selfUserId={user.id}
              onSelect={selectConversation}
              onCompose={() => setComposeOpen(true)}
            />
          </div>
          <div className={selectedId ? "" : "hidden sm:flex"}>
            <MessagePane
              conversation={selectedConversation}
              messages={messagesQuery.data?.items}
              isPending={conversationQuery.isPending || messagesQuery.isPending}
              isError={conversationQuery.isError || messagesQuery.isError}
              selfUserId={user.id}
              onBack={selectedId ? clearSelection : undefined}
              onSend={handleSend}
              onArchive={handleArchive}
              isSending={sendMutation.isPending}
            />
          </div>
        </div>
      </div>
      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onCreated={(conversationId) => {
          selectConversation(conversationId)
          toast.success("Conversation started")
        }}
      />
    </div>
  )
}