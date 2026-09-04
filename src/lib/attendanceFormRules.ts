import type { AttendanceBulkMarkPayload, AttendanceStatusType } from "@/types/attendance"

export interface AttendanceBulkMarkItem {
  studentId: string
  studentName: string
  admissionNumber: string
  status: AttendanceStatusType
  note: string
}

export interface AttendanceMarkingFormValue {
  academicSessionId: string
  classId: string
  sectionId: string | null
  date: string
  records: AttendanceBulkMarkItem[]
}

export function attendanceBulkMarkToPayload(
  value: AttendanceMarkingFormValue,
): AttendanceBulkMarkPayload {
  return {
    academicSessionId: value.academicSessionId,
    classId: value.classId,
    sectionId: value.sectionId,
    date: value.date,
    records: value.records.map((r) => ({
      studentId: r.studentId,
      status: r.status,
      note: r.note || undefined,
    })),
  }
}

export function defaultAttendanceMarkingForm(): AttendanceMarkingFormValue {
  return {
    academicSessionId: "",
    classId: "",
    sectionId: null,
    date: new Date().toISOString().slice(0, 10),
    records: [],
  }
}
