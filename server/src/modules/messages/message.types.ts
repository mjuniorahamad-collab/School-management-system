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