export type MessageConversationType = "DIRECT" | "GROUP"

export interface MessageParticipant {
  userId: string
  name: string
  email: string
  role: string | null
  lastReadAt: string | null
  isArchived: boolean
}

export interface ConversationListItem {
  id: string
  type: MessageConversationType
  title: string | null
  participants: MessageParticipant[]
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageAt: string | null
  lastMessageSenderId: string | null
  lastMessageSenderName: string | null
  updatedAt: string
}

export type ConversationDetail = ConversationListItem & {
  createdAt: string
  createdBy: string | null
}

export interface ConversationListResult {
  items: ConversationListItem[]
  total: number
}

export interface MessageListItem {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
}

export interface MessageListResult {
  items: MessageListItem[]
  total: number
}

export interface RecipientOption {
  userId: string
  name: string
  email: string
  role: string
}

export interface UnreadCountResult {
  total: number
}

export interface ConversationsQuery {
  page?: number
  pageSize?: number
}

export interface MessagesQuery {
  page?: number
  pageSize?: number
  before?: string
}

export interface RecipientsQuery {
  search?: string
  roleNames?: string[]
  limit?: number
}

export interface CreateConversationPayload {
  type: MessageConversationType
  title?: string
  recipientIds?: string[]
  roleNames?: string[]
}

export interface AddParticipantsPayload {
  recipientIds?: string[]
  roleNames?: string[]
}

/** Roles that carry `messages:view` in the permission catalog (server-validated). */
export const MESSAGABLE_ROLES = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "RECEPTIONIST",
  "PARENT",
] as const

export type MessagableRole = (typeof MESSAGABLE_ROLES)[number]

export function conversationDisplayTitle(conversation: ConversationListItem, selfUserId: string): string {
  if (conversation.type === "GROUP") return conversation.title ?? "Group conversation"
  const other = conversation.participants.find((participant) => participant.userId !== selfUserId)
  return other?.name ?? "Conversation"
}

export function conversationDisplaySubtitle(conversation: ConversationListItem, selfUserId: string): string {
  if (conversation.type === "GROUP") {
    return conversation.participants.map((participant) => participant.name).join(", ")
  }
  const other = conversation.participants.find((participant) => participant.userId !== selfUserId)
  return other?.role ? other.role.replace(/_/g, " ").toLowerCase() : ""
}