export type TimetableDayType =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"

export interface TimetableEntryListItem {
  id: string
  academicSessionId: string
  dayOfWeek: TimetableDayType
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
  dayOfWeek?: TimetableDayType
}

export interface TimetableEntryFormPayload {
  academicSessionId: string
  dayOfWeek: TimetableDayType
  periodSlotId: string
  classId: string
  sectionId?: string | null
  subjectId: string
  teacherId: string
}

export interface TimetableEntryCopyDayPayload {
  academicSessionId: string
  sourceDay: TimetableDayType
  targetDay: TimetableDayType
}
