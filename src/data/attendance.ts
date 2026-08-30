import type { AttendancePeriod, AttendanceSummary } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Illustrative attendance figures; will be replaced by the Attendance API.

export const attendanceData: Record<AttendancePeriod, AttendanceSummary> = {
  today: {
    total: 1248,
    present: 1148,
    late: 62,
    absent: 38,
    average: 92,
  },
  week: {
    total: 1248,
    present: 1119,
    late: 71,
    absent: 58,
    average: 90,
  },
  month: {
    total: 1248,
    present: 1092,
    late: 84,
    absent: 72,
    average: 87,
  },
}