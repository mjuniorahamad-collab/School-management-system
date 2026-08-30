import type { Notice } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Illustrative notices; will be replaced by the Notices API.

export const importantNotices: Notice[] = [
  {
    id: "n1",
    title: "School remains closed on May 29",
    summary:
      "The school will remain closed for all classes on account of the summer maintenance day.",
    publishedAt: "2026-05-27T10:30:00+05:30",
    priority: "high",
  },
  {
    id: "n2",
    title: "PTM scheduled on May 30",
    summary:
      "Parent Teacher Meeting is scheduled on Saturday, May 30. Meeting slots are now open for booking.",
    publishedAt: "2026-05-26T09:15:00+05:30",
    priority: "medium",
  },
  {
    id: "n3",
    title: "Final examinations begin from June 10",
    summary:
      "The final examination schedule has been published. Students are advised to collect hall tickets from class teachers.",
    publishedAt: "2026-05-24T16:45:00+05:30",
    priority: "high",
  },
]