// Academic calendar domain types (docs/academic-calendar.md).
//
// The calendar records which weekdays are working days for an academic session
// and any explicit per-date instructional overrides. A calendar/day is
// "confirmed" separately from its provenance; confirmation is never implied by
// seeding or by a MON–FRI default.

export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const

export type WeekdayValue = (typeof WEEKDAYS)[number]

export type ProvenanceValue = "SEEDED" | "AUTHORED"
export type CalendarDayKindValue = "INSTRUCTIONAL" | "NON_INSTRUCTIONAL"

export interface AcademicCalendarDetail {
  id: string
  academicSessionId: string
  workingWeekdays: WeekdayValue[]
  provenance: ProvenanceValue
  confirmedAt: string | null
  confirmedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarDayDetail {
  id: string
  academicSessionId: string
  date: string
  kind: CalendarDayKindValue
  instructionalValue: number
  label: string | null
  note: string | null
  source: ProvenanceValue
  confirmedAt: string | null
  confirmedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarDayListResult {
  items: CalendarDayDetail[]
  total: number
}
