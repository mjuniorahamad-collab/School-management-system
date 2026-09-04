export type EventCategory = "GENERAL" | "ACADEMIC" | "SPORTS" | "CULTURAL" | "COMMUNITY"
export type EventStatus = "SCHEDULED" | "ONGOING" | "COMPLETED" | "CANCELLED"

export interface EventListItem {
  id: string
  title: string
  category: string
  status: string
  startAt: string
  endAt: string
  location: string | null
  createdAt: string
  updatedAt: string
}

export type EventDetail = EventListItem & { description: string | null }

export interface EventListResult {
  items: EventListItem[]
  total: number
}
