import { api } from "@/lib/apiClient"
import type {
  EventDetail,
  EventFormPayload,
  EventListResult,
  EventsQuery,
  NoticeDetail,
  NoticeFormPayload,
  NoticeListResult,
  NoticesQuery,
} from "@/types/communication"

function noticeParams(query: NoticesQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.audience) params.set("audience", query.audience)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

function eventParams(query: EventsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.category) params.set("category", query.category)
  if (query.status) params.set("status", query.status)
  if (query.from) params.set("from", query.from)
  if (query.to) params.set("to", query.to)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

// Data seam for the Notices module.
export const noticesService = {
  list(query: NoticesQuery): Promise<NoticeListResult> {
    return api.get<NoticeListResult>(`/notices?${noticeParams(query)}`)
  },
  get(id: string): Promise<NoticeDetail> {
    return api.get<NoticeDetail>(`/notices/${id}`)
  },
  create(payload: NoticeFormPayload): Promise<NoticeDetail> {
    return api.post<NoticeDetail>("/notices", payload)
  },
  update(id: string, payload: Partial<NoticeFormPayload>): Promise<NoticeDetail> {
    return api.patch<NoticeDetail>(`/notices/${id}`, payload)
  },
  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete<{ id: string; deleted: boolean }>(`/notices/${id}`)
  },
}

// Data seam for the Events module.
export const eventsService = {
  list(query: EventsQuery): Promise<EventListResult> {
    return api.get<EventListResult>(`/events?${eventParams(query)}`)
  },
  get(id: string): Promise<EventDetail> {
    return api.get<EventDetail>(`/events/${id}`)
  },
  create(payload: EventFormPayload): Promise<EventDetail> {
    return api.post<EventDetail>("/events", payload)
  },
  update(id: string, payload: Partial<EventFormPayload>): Promise<EventDetail> {
    return api.patch<EventDetail>(`/events/${id}`, payload)
  },
  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete<{ id: string; deleted: boolean }>(`/events/${id}`)
  },
}
