import type { TimetableEntry } from "@prisma/client"
import type { TimetableEntryDetail, TimetableEntryListItem } from "./timetable.types.js"

type TimetableEntryWithIncludes = TimetableEntry & {
  periodSlot: { name: string; startTime: string; endTime: string }
  class: { name: string }
  section: { name: string } | null
  subject: { name: string; code: string }
  teacher: { firstName: string; lastName: string | null }
}

function teacherName(teacher: { firstName: string; lastName: string | null }): string {
  return [teacher.firstName, teacher.lastName].filter(Boolean).join(" ")
}

export function toTimetableEntryListItem(entry: TimetableEntryWithIncludes): TimetableEntryListItem {
  return {
    id: entry.id,
    academicSessionId: entry.academicSessionId,
    dayOfWeek: entry.dayOfWeek,
    periodSlotId: entry.periodSlotId,
    periodSlotName: entry.periodSlot.name,
    periodSlotStartTime: entry.periodSlot.startTime,
    periodSlotEndTime: entry.periodSlot.endTime,
    classId: entry.classId,
    className: entry.class.name,
    sectionId: entry.sectionId,
    sectionName: entry.section?.name ?? null,
    subjectId: entry.subjectId,
    subjectName: entry.subject.name,
    subjectCode: entry.subject.code,
    teacherId: entry.teacherId,
    teacherName: teacherName(entry.teacher),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

export function toTimetableEntryDetail(entry: TimetableEntryWithIncludes): TimetableEntryDetail {
  return toTimetableEntryListItem(entry)
}
