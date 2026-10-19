// Attendance register domain types (docs/academic-calendar.md §8).
//
// A register tracks completeness for one class/section scope on one date. It is
// separate from individual AttendanceRecord rows: marking records never changes a
// register, and a register is only VERIFIED once every expected student has a
// definitive record.

export type AttendanceRegisterStatusValue = "OPEN" | "SUBMITTED" | "VERIFIED"

export interface AttendanceRegisterDetail {
  id: string
  academicSessionId: string
  classId: string
  sectionId: string | null
  scopeKey: string
  date: string
  status: AttendanceRegisterStatusValue
  expectedCount: number
  submittedAt: string | null
  submittedByUserId: string | null
  verifiedAt: string | null
  verifiedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface AttendanceRegisterListResult {
  items: AttendanceRegisterDetail[]
  total: number
}
