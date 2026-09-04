import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { attendanceService } from "@/services/attendanceService"
import type {
  AttendanceBulkMarkPayload,
  AttendanceMarkPayload,
  AttendanceRecordListQuery,
  AttendanceSummaryQuery,
} from "@/types/attendance"

const ATTENDANCE_GROUP = ["attendance"] as const

export function useAttendanceRecords(query: AttendanceRecordListQuery) {
  return useQuery({
    queryKey: ["attendance", query],
    queryFn: () => attendanceService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useMarkAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AttendanceMarkPayload) => attendanceService.mark(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_GROUP })
      toast.success("Attendance marked")
    },
    onError: (e: Error) => toast.error("Could not mark attendance", { description: e.message }),
  })
}

export function useBulkMarkAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AttendanceBulkMarkPayload) => attendanceService.bulkMark(payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_GROUP })
      toast.success(`Marked attendance for ${result.marked} students`)
    },
    onError: (e: Error) => toast.error("Could not mark attendance", { description: e.message }),
  })
}

export function useUpdateAttendanceRecord(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<AttendanceMarkPayload>) => attendanceService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_GROUP })
      toast.success("Attendance record updated")
    },
    onError: (e: Error) => toast.error("Could not update record", { description: e.message }),
  })
}

export function useDeleteAttendanceRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => attendanceService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_GROUP })
      toast.success("Attendance record deleted")
    },
    onError: (e: Error) => toast.error("Could not delete record", { description: e.message }),
  })
}

export function useAttendanceSummary(query: AttendanceSummaryQuery) {
  return useQuery({
    queryKey: ["attendance", "summary", query],
    queryFn: () => attendanceService.summary(query),
    enabled: Boolean(query.academicSessionId && query.classId && query.dateFrom && query.dateTo),
  })
}
