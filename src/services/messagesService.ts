import { api } from "@/lib/apiClient"
import type {
  AddParticipantsPayload,
  ConversationDetail,
  ConversationListResult,
  ConversationsQuery,
  CreateConversationPayload,
  MessageListResult,
  MessagesQuery,
  RecipientOption,
  RecipientsQuery,
  UnreadCountResult,
} from "@/types/messages"

function conversationParams(query: ConversationsQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page ?? 1))
  params.set("pageSize", String(query.pageSize ?? 20))
  return params.toString()
}

function messageParams(query: MessagesQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page ?? 1))
  params.set("pageSize", String(query.pageSize ?? 30))
  if (query.before) params.set("before", query.before)
  return params.toString()
}

function recipientParams(query: RecipientsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.roleNames && query.roleNames.length > 0) params.set("roleNames", query.roleNames.join(","))
  params.set("limit", String(query.limit ?? 25))
  return params.toString()
}

// Data seam for the Messages module. All calls hit the real REST API via the
// shared apiClient; the server resolves the tenant and participant scope.
export const messagesService = {
  listConversations(query: ConversationsQuery = {}): Promise<ConversationListResult> {
    return api.get<ConversationListResult>(`/messages/conversations?${conversationParams(query)}`)
  },
  getConversation(id: string): Promise<ConversationDetail> {
    return api.get<ConversationDetail>(`/messages/conversations/${id}`)
  },
  listMessages(conversationId: string, query: MessagesQuery = {}): Promise<MessageListResult> {
    return api.get<MessageListResult>(
      `/messages/conversations/${conversationId}/messages?${messageParams(query)}`,
    )
  },
  listRecipients(query: RecipientsQuery = {}): Promise<RecipientOption[]> {
    return api.get<RecipientOption[]>(`/messages/recipients?${recipientParams(query)}`)
  },
  getUnreadCount(): Promise<UnreadCountResult> {
    return api.get<UnreadCountResult>("/messages/unread-count")
  },
  createConversation(payload: CreateConversationPayload): Promise<ConversationDetail> {
    return api.post<ConversationDetail>("/messages/conversations", payload)
  },
  sendMessage(conversationId: string, body: string): Promise<void> {
    return api.post(`/messages/conversations/${conversationId}/messages`, { body })
  },
  markConversationRead(conversationId: string): Promise<{ conversationId: string; readAt: string }> {
    return api.post(`/messages/conversations/${conversationId}/read`, {})
  },
  archiveConversation(conversationId: string): Promise<{ conversationId: string; archivedAt: string }> {
    return api.post(`/messages/conversations/${conversationId}/archive`, {})
  },
  addParticipants(conversationId: string, payload: AddParticipantsPayload): Promise<ConversationDetail> {
    return api.post(`/messages/conversations/${conversationId}/participants`, payload)
  },
}