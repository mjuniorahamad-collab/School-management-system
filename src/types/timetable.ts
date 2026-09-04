export type TimetableDay = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY"

export interface TimetableEntryListItem {
  id: string
  academicSessionId: string
  dayOfWeek: TimetableDay
  periodSlotId: string
  periodSlotName: string
  periodSlotStartTime: string
  periodSlotEndTime: string
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  subjectId: string
  subjectName: string
  subjectCode: string
  teacherId: string
  teacherName: string
  createdAt: string
  updatedAt: string
}

export type TimetableEntryDetail = TimetableEntryListItem

export interface TimetableEntryListResult {
  items: TimetableEntryListItem[]
  total: number
}

export interface TimetableEntryListQuery {
  academicSessionId?: string
  classId?: string
  sectionId?: string
  teacherId?: string
  dayOfWeek?: TimetableDay
}

export interface TimetableEntryFormPayload {
  academicSessionId: string
  dayOfWeek: TimetableDay
  periodSlotId: string
  classId: string
  sectionId?: string | null
  subjectId: string
  teacherId: string
}

export interface TimetableEntryCopyDayPayload {
  academicSessionId: string
  sourceDay: TimetableDay
  targetDay: TimetableDay
}

export const TIMETABLE_DAYS: TimetableDay[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
]

export const TIMETABLE_DAY_LABELS: Record<TimetableDay, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
}
