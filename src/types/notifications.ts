export type NotificationType = "FEE_INVOICE" | "FEE_PAYMENT" | "PORTAL_LINK" | "ADMIN"

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

export type NotificationFilter = "all" | "unread"

export interface NotificationsQuery {
  page?: number
  pageSize?: number
  type?: NotificationType
  filter?: NotificationFilter
}

export interface CreateNotificationPayload {
  title: string
  body?: string
  linkPath?: string
  recipientIds?: string[]
  roleNames?: string[]
}

// Selectable targets for manual ADMIN notifications. SUPER_ADMIN is excluded:
// it is a platform role with no tenant memberships, so it can never be a member
// of this school's feed. The server validates every target independently.
export const NOTIFICATION_TARGET_ROLES = [
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "ACCOUNTANT",
  "LIBRARIAN",
  "TRANSPORT_MANAGER",
  "HOSTEL_WARDEN",
  "RECEPTIONIST",
  "PARENT",
  "STUDENT",
] as const

export type NotificationTargetRole = (typeof NOTIFICATION_TARGET_ROLES)[number]

export function notificationTypeLabel(type: NotificationType): string {
  switch (type) {
    case "FEE_INVOICE":
      return "Fee invoice"
    case "FEE_PAYMENT":
      return "Payment"
    case "PORTAL_LINK":
      return "Portal"
    case "ADMIN":
      return "Announcement"
  }
}

// Type → tone accent dot / icon class used across the feed (indigo primary,
// semantic emerald for money credited, sky for invoices and system events).
export function notificationToneFor(type: NotificationType): string {
  switch (type) {
    case "FEE_PAYMENT":
      return "bg-emerald-500"
    case "FEE_INVOICE":
      return "bg-sky-500"
    case "PORTAL_LINK":
    case "ADMIN":
      return "bg-indigo-500"
  }
}