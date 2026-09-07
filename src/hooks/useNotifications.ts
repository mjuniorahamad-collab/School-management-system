import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { notificationsService } from "@/services/notificationsService"
import type { CreateNotificationPayload, NotificationsQuery } from "@/types/notifications"

const NOTIFICATIONS_KEYS = ["notifications"] as const

export function useNotifications(query: NotificationsQuery = {}) {
  return useQuery({
    queryKey: ["notifications", "list", query],
    queryFn: () => notificationsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useNotificationCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => notificationsService.getUnreadCount(),
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEYS })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEYS })
    },
  })
}

export function useCreateNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateNotificationPayload) => notificationsService.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEYS })
    },
  })
}