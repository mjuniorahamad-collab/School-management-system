import type { Event } from "@prisma/client"
import type { EventDetail, EventListItem } from "./event.types.js"

export function toEventListItem(event: Event): EventListItem {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    status: event.status,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    location: event.location,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }
}

export function toEventDetail(event: Event): EventDetail {
  return { ...toEventListItem(event), description: event.description }
}
