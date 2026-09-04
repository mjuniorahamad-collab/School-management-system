import type { AttendanceRecord } from "@prisma/client"
import type { AttendanceRecordDetail, AttendanceRecordListItem } from "./attendance.types.js"

type AttendanceRecordWithIncludes = AttendanceRecord & {
  student: { firstName: string; lastName: string | null; admissionNumber: string }
  class: { name: string }
  section: { name: string } | null
  markedByUser: { name: string } | null
}

function studentName(student: { firstName: string; lastName: string | null }): string {
  return [student.firstName, student.lastName].filter(Boolean).join(" ")
}

export function toAttendanceRecordListItem(
  record: AttendanceRecordWithIncludes,
): AttendanceRecordListItem {
  return {
    id: record.id,
    date: record.date.toISOString().slice(0, 10),
    status: record.status,
    note: record.note,
    markedBy: record.markedBy,
    markedByName: record.markedByUser?.name ?? null,
    studentId: record.studentId,
    studentName: studentName(record.student),
    admissionNumber: record.student.admissionNumber,
    enrollmentId: record.enrollmentId,
    classId: record.classId,
    className: record.class.name,
    sectionId: record.sectionId,
    sectionName: record.section?.name ?? null,
    academicSessionId: record.academicSessionId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

export function toAttendanceRecordDetail(
  record: AttendanceRecordWithIncludes,
): AttendanceRecordDetail {
  return toAttendanceRecordListItem(record)
}
