// Domain types for the Notices and Events modules. Mirror the backend contracts.

export type NoticeAudience = "EVERYONE" | "STUDENTS" | "PARENTS" | "TEACHERS" | "STAFF"
export type NoticeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"
export type NoticePriority = "HIGH" | "MEDIUM" | "LOW"

export interface NoticeListItem {
  id: string
  title: string
  audience: string
  status: string
  priority: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type NoticeDetail = NoticeListItem & { body: string }

export interface NoticeListResult {
  items: NoticeListItem[]
  total: number
}

export interface NoticesQuery {
  search?: string
  status?: NoticeStatus
  audience?: NoticeAudience
  page?: number
  pageSize?: number
}

export interface NoticeFormPayload {
  title: string
  body: string
  audience?: NoticeAudience
  status?: NoticeStatus
  priority?: NoticePriority
}

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

export interface EventsQuery {
  search?: string
  category?: EventCategory
  status?: EventStatus
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface EventFormPayload {
  title: string
  description?: string
  category?: EventCategory
  status?: EventStatus
  startAt: string
  endAt: string
  location?: string
}
