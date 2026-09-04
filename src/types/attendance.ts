export type AttendanceStatusType = "PRESENT" | "ABSENT" | "LATE" | "HOLIDAY"

export interface AttendanceRecordListItem {
  id: string
  date: string
  status: AttendanceStatusType
  note: string | null
  markedBy: string | null
  markedByName: string | null
  studentId: string
  studentName: string
  admissionNumber: string
  enrollmentId: string
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  academicSessionId: string
  createdAt: string
  updatedAt: string
}

export type AttendanceRecordDetail = AttendanceRecordListItem

export interface AttendanceRecordListResult {
  items: AttendanceRecordListItem[]
  total: number
}

export interface AttendanceRecordListQuery {
  academicSessionId?: string
  classId?: string
  sectionId?: string
  studentId?: string
  dateFrom?: string
  dateTo?: string
}

export interface AttendanceMarkPayload {
  academicSessionId: string
  classId: string
  sectionId?: string | null
  date: string
  studentId: string
  status: AttendanceStatusType
  note?: string
}

export interface AttendanceBulkMarkPayload {
  academicSessionId: string
  classId: string
  sectionId?: string | null
  date: string
  records: Array<{
    studentId: string
    status: AttendanceStatusType
    note?: string
  }>
}

export interface AttendanceSummaryQuery {
  academicSessionId: string
  classId: string
  sectionId?: string
  dateFrom: string
  dateTo: string
}

export interface AttendanceSummaryItem {
  studentId: string
  studentName: string
  admissionNumber: string
  totalDays: number
  present: number
  absent: number
  late: number
  holiday: number
  attendancePercent: number
}

export interface AttendanceSummaryResult {
  items: AttendanceSummaryItem[]
  totalDays: number
}

export const ATTENDANCE_STATUSES: AttendanceStatusType[] = ["PRESENT", "ABSENT", "LATE", "HOLIDAY"]

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatusType, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  HOLIDAY: "Holiday",
}
