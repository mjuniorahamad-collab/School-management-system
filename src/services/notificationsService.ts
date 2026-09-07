import { api } from "@/lib/apiClient"
import type {
  CreateNotificationPayload,
  CreateNotificationResult,
  NotificationListResult,
  NotificationsQuery,
  UnreadNotificationCountResult,
} from "@/types/notifications"

function listParams(query: NotificationsQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page ?? 1))
  params.set("pageSize", String(query.pageSize ?? 20))
  if (query.type) params.set("type", query.type)
  params.set("filter", query.filter ?? "all")
  return params.toString()
}

// Data seam for the Notifications module. All calls hit the real REST API via
// the shared apiClient; the server re-scopes every read to the caller's tenant
// and recipient identity.
export const notificationsService = {
  list(query: NotificationsQuery = {}): Promise<NotificationListResult> {
    return api.get<NotificationListResult>(`/notifications?${listParams(query)}`)
  },
  getUnreadCount(): Promise<UnreadNotificationCountResult> {
    return api.get<UnreadNotificationCountResult>("/notifications/unread-count")
  },
  markRead(id: string): Promise<{ id: string; readAt: string }> {
    return api.post(`/notifications/${id}/read`, {})
  },
  markAllRead(): Promise<{ updatedCount: number }> {
    return api.post("/notifications/read-all", {})
  },
  // Manual sends are always type ADMIN (server-locked); other types are produced
  // exclusively by the automatic event triggers.
  create(payload: CreateNotificationPayload): Promise<CreateNotificationResult> {
    return api.post<CreateNotificationResult>("/notifications", { ...payload, type: "ADMIN" })
  },
}