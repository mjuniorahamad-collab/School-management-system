import type { Prisma } from "@prisma/client"
import type { Conversation, ConversationParticipant, Message, TenantMembership, User } from "@prisma/client"
import type {
  ConversationDetail,
  ConversationListItem,
  MessageConversationType,
  MessageListItem,
  MessageParticipant,
  RecipientOption,
} from "./message.types.js"

export const conversationInclude = {
  participants: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
  lastMessageUser: { select: { id: true, name: true } },
} satisfies Prisma.ConversationInclude

export type ConversationRow = Conversation & {
  participants: (ConversationParticipant & { user: Pick<User, "id" | "name" | "email"> })[]
  lastMessageUser: Pick<User, "id" | "name"> | null
}

type MessageWithSender = Message & { sender: Pick<User, "id" | "name"> }

type RecipientMembership = TenantMembership & {
  user: Pick<User, "id" | "name" | "email">
  role: { name: string }
}

export function toParticipant(participant: ConversationRow["participants"][number]): MessageParticipant {
  return {
    userId: participant.userId,
    name: participant.user.name,
    email: participant.user.email,
    role: participant.role,
    lastReadAt: participant.lastReadAt?.toISOString() ?? null,
    isArchived: participant.isArchived,
  }
}

export function toConversationDetail(
  conversation: ConversationRow,
  unreadCount: number,
): ConversationDetail {
  return {
    ...toConversationListItem(conversation, unreadCount),
    createdAt: conversation.createdAt.toISOString(),
    createdBy: conversation.createdBy,
  }
}

export function toConversationListItem(
  conversation: ConversationRow,
  unreadCount: number,
): ConversationListItem {
  return {
    id: conversation.id,
    type: conversation.type as MessageConversationType,
    title: conversation.title,
    participants: conversation.participants.map(toParticipant),
    unreadCount,
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    lastMessageSenderId: conversation.lastMessageSenderId,
    lastMessageSenderName: conversation.lastMessageUser?.name ?? null,
    updatedAt: conversation.updatedAt.toISOString(),
  }
}

export function toMessageListItem(message: MessageWithSender): MessageListItem {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender.name,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  }
}

export function toRecipientOption(membership: RecipientMembership): RecipientOption {
  return {
    userId: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role.name,
  }
}