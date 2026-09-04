import type { EventCategory, EventFormPayload } from "@/types/communication"

export interface EventFormValue {
  title: string
  description: string
  category: EventCategory
  status: EventStatusFormValue
  startAt: string
  endAt: string
  location: string
}

type EventStatusFormValue = "SCHEDULED" | "ONGOING" | "COMPLETED" | "CANCELLED"

export interface EventFormError {
  field: keyof EventFormValue
  message: string
}

const CATEGORIES: EventCategory[] = [
  "GENERAL",
  "ACADEMIC",
  "SPORTS",
  "CULTURAL",
  "COMMUNITY",
]

export function validateEventForm(value: EventFormValue): EventFormError[] {
  const errors: EventFormError[] = []
  if (!value.title.trim()) errors.push({ field: "title", message: "Event title is required" })
  if (!CATEGORIES.includes(value.category)) {
    errors.push({ field: "category", message: "Invalid category" })
  }
  const start = new Date(value.startAt)
  const end = new Date(value.endAt)
  if (!value.startAt || Number.isNaN(start.getTime())) {
    errors.push({ field: "startAt", message: "A valid start date/time is required" })
  }
  if (!value.endAt || Number.isNaN(end.getTime())) {
    errors.push({ field: "endAt", message: "A valid end date/time is required" })
  }
  if (
    value.startAt &&
    value.endAt &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end.getTime() <= start.getTime()
  ) {
    errors.push({ field: "endAt", message: "End date/time must be after start" })
  }
  return errors
}

export function eventFormToPayload(value: EventFormValue): EventFormPayload {
  const payload: EventFormPayload = {
    title: value.title.trim(),
    category: value.category,
    status: value.status,
    startAt: new Date(value.startAt).toISOString(),
    endAt: new Date(value.endAt).toISOString(),
  }
  if (value.description.trim()) payload.description = value.description.trim()
  if (value.location.trim()) payload.location = value.location.trim()
  return payload
}
