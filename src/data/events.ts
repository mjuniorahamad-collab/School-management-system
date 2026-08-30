import type { SchoolEvent } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Illustrative school events; will be replaced by the Events API.

export const upcomingEvents: SchoolEvent[] = [
  {
    id: "e1",
    title: "Annual Sports Day",
    date: "2026-05-28",
    time: "9:00 AM – 3:00 PM",
    category: "sports",
  },
  {
    id: "e2",
    title: "Parent Teacher Meeting",
    date: "2026-05-30",
    time: "10:00 AM – 12:00 PM",
    category: "academic",
  },
  {
    id: "e3",
    title: "Environment Day",
    date: "2026-06-05",
    time: "9:00 AM – 11:00 AM",
    category: "community",
  },
  {
    id: "e4",
    title: "Final Examinations Begin",
    date: "2026-06-10",
    time: "8:30 AM onward",
    category: "academic",
  },
]