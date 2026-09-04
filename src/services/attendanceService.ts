import { api } from "@/lib/apiClient"
import type {
  AttendanceBulkMarkPayload,
  AttendanceMarkPayload,
  AttendanceRecordDetail,
  AttendanceRecordListResult,
  AttendanceRecordListQuery,
  AttendanceSummaryQuery,
  AttendanceSummaryResult,
} from "@/types/attendance"

function attendanceParams(query: AttendanceRecordListQuery): string {
  const params = new URLSearchParams()
  if (query.academicSessionId) params.set("academicSessionId", query.academicSessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.sectionId) params.set("sectionId", query.sectionId)
  if (query.studentId) params.set("studentId", query.studentId)
  if (query.dateFrom) params.set("dateFrom", query.dateFrom)
  if (query.dateTo) params.set("dateTo", query.dateTo)
  return params.toString()
}

function summaryParams(query: AttendanceSummaryQuery): string {
  const params = new URLSearchParams()
  params.set("academicSessionId", query.academicSessionId)
  params.set("classId", query.classId)
  if (query.sectionId) params.set("sectionId", query.sectionId)
  params.set("dateFrom", query.dateFrom)
  params.set("dateTo", query.dateTo)
  return params.toString()
}

export const attendanceService = {
  list(query: AttendanceRecordListQuery): Promise<AttendanceRecordListResult> {
    return api.get<AttendanceRecordListResult>(`/attendance?${attendanceParams(query)}`)
  },
  get(id: string): Promise<AttendanceRecordDetail> {
    return api.get<AttendanceRecordDetail>(`/attendance/${id}`)
  },
  mark(payload: AttendanceMarkPayload): Promise<AttendanceRecordDetail> {
    return api.post<AttendanceRecordDetail>("/attendance", payload)
  },
  bulkMark(payload: AttendanceBulkMarkPayload): Promise<{ marked: number }> {
    return api.post<{ marked: number }>("/attendance/bulk", payload)
  },
  update(id: string, payload: Partial<AttendanceMarkPayload>): Promise<AttendanceRecordDetail> {
    return api.patch<AttendanceRecordDetail>(`/attendance/${id}`, payload)
  },
  remove(id: string): Promise<{ deleted: boolean }> {
    return api.delete<{ deleted: boolean }>(`/attendance/${id}`)
  },
  summary(query: AttendanceSummaryQuery): Promise<AttendanceSummaryResult> {
    return api.get<AttendanceSummaryResult>(`/attendance/summary?${summaryParams(query)}`)
  },
}
