import type { Activity } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Illustrative recent activity; will be replaced by an activity/Audit API.

export const recentActivities: Activity[] = [
  {
    id: "a1",
    action: "New student admission",
    entity: "Aarav Nair · Class 6 · A",
    timestamp: "2026-05-28T08:45:00+05:30",
    tone: "success",
  },
  {
    id: "a2",
    action: "Fee payment received",
    entity: "Priya Verma · Class 9 · B",
    timestamp: "2026-05-28T08:20:00+05:30",
    tone: "success",
  },
  {
    id: "a3",
    action: "Teacher added",
    entity: "Ms. Kavita Rao · Mathematics",
    timestamp: "2026-05-27T17:10:00+05:30",
    tone: "info",
  },
  {
    id: "a4",
    action: "Exam result published",
    entity: "Class 10 · Unit Test 2",
    timestamp: "2026-05-27T14:05:00+05:30",
    tone: "info",
  },
  {
    id: "a5",
    action: "Notice published",
    entity: "Final examinations schedule",
    timestamp: "2026-05-26T16:45:00+05:30",
    tone: "warning",
  },
]