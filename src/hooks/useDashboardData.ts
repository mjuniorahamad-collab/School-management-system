import { useQuery } from "@tanstack/react-query"
import { dashboardService } from "@/services/dashboardService"
import type { AttendancePeriod, FeePeriod } from "@/types"

const QUERY_KEYS = {
  stats: ["dashboard", "stats"] as const,
  attendance: (period: AttendancePeriod) => ["dashboard", "attendance", period] as const,
  fees: (period: FeePeriod) => ["dashboard", "fees", period] as const,
  feeStatus: ["dashboard", "fee-status"] as const,
  recentStudents: ["dashboard", "recent-students"] as const,
  topClasses: ["dashboard", "top-classes"] as const,
  quickActions: ["dashboard", "quick-actions"] as const,
  events: ["dashboard", "events"] as const,
  notices: ["dashboard", "notices"] as const,
  activities: ["dashboard", "activities"] as const,
  birthdays: ["dashboard", "birthdays"] as const,
}

export function useDashboardStats() {
  return useQuery({ queryKey: QUERY_KEYS.stats, queryFn: dashboardService.getStats })
}

export function useAttendance(period: AttendancePeriod) {
  return useQuery({
    queryKey: QUERY_KEYS.attendance(period),
    queryFn: () => dashboardService.getAttendance(period),
  })
}

export function useFeeAnalytics(period: FeePeriod) {
  return useQuery({
    queryKey: QUERY_KEYS.fees(period),
    queryFn: () => dashboardService.getFeeAnalytics(period),
  })
}

export function useFeeCollectionStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.feeStatus,
    queryFn: dashboardService.getFeeCollectionStatus,
  })
}

export function useRecentStudents() {
  return useQuery({
    queryKey: QUERY_KEYS.recentStudents,
    queryFn: dashboardService.getRecentStudents,
  })
}

export function useTopPerformingClasses() {
  return useQuery({
    queryKey: QUERY_KEYS.topClasses,
    queryFn: dashboardService.getTopPerformingClasses,
  })
}

export function useQuickActions() {
  return useQuery({
    queryKey: QUERY_KEYS.quickActions,
    queryFn: dashboardService.getQuickActions,
  })
}

export function useUpcomingEvents() {
  return useQuery({ queryKey: QUERY_KEYS.events, queryFn: dashboardService.getUpcomingEvents })
}

export function useImportantNotices() {
  return useQuery({ queryKey: QUERY_KEYS.notices, queryFn: dashboardService.getImportantNotices })
}

export function useRecentActivities() {
  return useQuery({ queryKey: QUERY_KEYS.activities, queryFn: dashboardService.getRecentActivities })
}

export function useBirthdayStudents() {
  return useQuery({ queryKey: QUERY_KEYS.birthdays, queryFn: dashboardService.getBirthdayStudents })
}