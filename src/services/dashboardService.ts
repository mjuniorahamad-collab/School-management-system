import { api } from "@/lib/apiClient"
import type {
  AttendancePeriod,
  DashboardActivity,
  DashboardAttendance,
  DashboardBirthdayStudent,
  DashboardFeeAnalytics,
  DashboardFeeCollectionStatus,
  DashboardNotice,
  DashboardRecentStudent,
  DashboardStatItem,
  DashboardTopClasses,
  DashboardUpcomingEvent,
  FeePeriod,
} from "@/types/dashboard"

// Data seam for the Dashboard module. Every method hits the read-only REST
// aggregation API through the shared apiClient.

function queryString(params: Record<string, string>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value)
  }
  return search.toString()
}

export const dashboardService = {
  getStats(): Promise<DashboardStatItem[]> {
    return api
      .get<{ stats: DashboardStatItem[] }>("/dashboard/stats")
      .then((response) => response.stats)
  },

  getAttendance(period: AttendancePeriod): Promise<DashboardAttendance> {
    return api.get<DashboardAttendance>(`/dashboard/attendance?${queryString({ period })}`)
  },

  getFeeAnalytics(period: FeePeriod): Promise<DashboardFeeAnalytics> {
    return api.get<DashboardFeeAnalytics>(`/dashboard/fees?${queryString({ period })}`)
  },

  getFeeCollectionStatus(): Promise<DashboardFeeCollectionStatus> {
    return api.get<DashboardFeeCollectionStatus>("/dashboard/fee-status")
  },

  getRecentStudents(): Promise<DashboardRecentStudent[]> {
    return api.get<DashboardRecentStudent[]>("/dashboard/recent-students")
  },

  getTopPerformingClasses(): Promise<DashboardTopClasses> {
    return api.get<DashboardTopClasses>("/dashboard/top-classes")
  },

  getUpcomingEvents(): Promise<DashboardUpcomingEvent[]> {
    return api.get<DashboardUpcomingEvent[]>("/dashboard/events")
  },

  getImportantNotices(): Promise<DashboardNotice[]> {
    return api.get<DashboardNotice[]>("/dashboard/notices")
  },

  getRecentActivities(): Promise<DashboardActivity[]> {
    return api.get<DashboardActivity[]>("/dashboard/activity")
  },

  getBirthdayStudents(): Promise<DashboardBirthdayStudent[]> {
    return api.get<DashboardBirthdayStudent[]>("/dashboard/birthdays")
  },
}
