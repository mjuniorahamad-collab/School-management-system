import type { Activity } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Notification feed snapshot; will be replaced by the Notifications API.

export interface NotificationItem {
  id: string
  title: string
  detail: string
  timestamp: string
  read: boolean
  tone: Activity["tone"]
}

export const notifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "New admission pending approval",
    detail: "Aarav Nair · Class 6 · A",
    timestamp: "2026-05-28T09:10:00+05:30",
    read: false,
    tone: "info",
  },
  {
    id: "notif-2",
    title: "Low attendance alert",
    detail: "Class 8 · B recorded 74% today",
    timestamp: "2026-05-28T13:00:00+05:30",
    read: false,
    tone: "warning",
  },
  {
    id: "notif-3",
    title: "Fee payment received",
    detail: "₹25,000 from Riya Nair · Class 9 · A",
    timestamp: "2026-05-27T18:35:00+05:30",
    read: false,
    tone: "success",
  },
  {
    id: "notif-4",
    title: "Exam schedule published",
    detail: "Final examinations begin June 10",
    timestamp: "2026-05-27T16:45:00+05:30",
    read: true,
    tone: "info",
  },
]