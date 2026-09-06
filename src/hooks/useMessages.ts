import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { messagesService } from "@/services/messagesService"
import type {
  AddParticipantsPayload,
  ConversationsQuery,
  CreateConversationPayload,
  MessagesQuery,
  RecipientsQuery,
} from "@/types/messages"

const INVALIDATE_KEYS = ["messages"] as const

export function useConversations(query: ConversationsQuery = {}) {
  return useQuery({
    queryKey: ["messages", "conversations", query],
    queryFn: () => messagesService.listConversations(query),
    placeholderData: (previous) => previous,
  })
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ["messages", "conversations", id],
    queryFn: () => messagesService.getConversation(id as string),
    enabled: id !== null,
  })
}

export function useMessages(conversationId: string | null, query: MessagesQuery = {}) {
  return useQuery({
    queryKey: ["messages", "conversations", conversationId, "messages", query],
    queryFn: () => messagesService.listMessages(conversationId as string, query),
    enabled: conversationId !== null,
  })
}

export function useRecipients(query: RecipientsQuery) {
  return useQuery({
    queryKey: ["messages", "recipients", query],
    queryFn: () => messagesService.listRecipients(query),
    enabled: (query.search ?? "").length >= 0,
    placeholderData: (previous) => previous,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["messages", "unread"],
    queryFn: () => messagesService.getUnreadCount(),
    refetchInterval: 30_000,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateConversationPayload) => messagesService.createConversation(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVALIDATE_KEYS })
    },
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, body }: { conversationId: string; body: string }) =>
      messagesService.sendMessage(conversationId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVALIDATE_KEYS })
    },
  })
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => messagesService.markConversationRead(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVALIDATE_KEYS })
    },
  })
}

export function useArchiveConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => messagesService.archiveConversation(conversationId),
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: INVALIDATE_KEYS })
      void queryClient.removeQueries({ queryKey: ["messages", "conversations", conversationId] })
    },
  })
}

export function useAddParticipants() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: string; payload: AddParticipantsPayload }) =>
      messagesService.addParticipants(conversationId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVALIDATE_KEYS })
    },
  })
}