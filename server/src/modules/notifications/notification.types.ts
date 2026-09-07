export type NotificationType = "FEE_INVOICE" | "FEE_PAYMENT" | "PORTAL_LINK" | "ADMIN"

/** A single notification as seen by the reading recipient (junction state merged). */
export interface NotificationListItem {
  id: string
  type: NotificationType
  title: string
  body: string | null
  linkPath: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationListResult {
  items: NotificationListItem[]
  total: number
}

export interface UnreadNotificationCountResult {
  total: number
}

export interface CreateNotificationResult {
  notificationId: string
  recipientCount: number
}