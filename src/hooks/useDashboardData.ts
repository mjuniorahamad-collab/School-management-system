import { useQuery } from "@tanstack/react-query"
import { dashboardService } from "@/services/dashboardService"
import type { AttendancePeriod, FeePeriod } from "@/types/dashboard"

const QUERY_KEYS = {
  stats: ["dashboard", "stats"] as const,
  feeStat: ["dashboard", "fee-stat"] as const,
  attendance: (period: AttendancePeriod) => ["dashboard", "attendance", period] as const,
  fees: (period: FeePeriod) => ["dashboard", "fees", period] as const,
  feeStatus: ["dashboard", "fee-status"] as const,
  recentStudents: ["dashboard", "recent-students"] as const,
  topClasses: ["dashboard", "top-classes"] as const,
  events: ["dashboard", "events"] as const,
  notices: ["dashboard", "notices"] as const,
  activities: ["dashboard", "activities"] as const,
  birthdays: ["dashboard", "birthdays"] as const,
}

export function useDashboardStats(enabled = true) {
  return useQuery({ queryKey: QUERY_KEYS.stats, queryFn: dashboardService.getStats, enabled })
}

export function useFeeStat(enabled = true) {
  return useQuery({ queryKey: QUERY_KEYS.feeStat, queryFn: dashboardService.getFeeStat, enabled })
}

export function useAttendance(period: AttendancePeriod, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.attendance(period),
    queryFn: () => dashboardService.getAttendance(period),
    enabled,
  })
}

export function useFeeAnalytics(period: FeePeriod, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.fees(period),
    queryFn: () => dashboardService.getFeeAnalytics(period),
    enabled,
  })
}

export function useFeeCollectionStatus(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.feeStatus,
    queryFn: dashboardService.getFeeCollectionStatus,
    enabled,
  })
}

export function useRecentStudents(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.recentStudents,
    queryFn: dashboardService.getRecentStudents,
    enabled,
  })
}

export function useTopPerformingClasses(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.topClasses,
    queryFn: dashboardService.getTopPerformingClasses,
    enabled,
  })
}

export function useUpcomingEvents(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.events,
    queryFn: dashboardService.getUpcomingEvents,
    enabled,
  })
}

export function useImportantNotices(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.notices,
    queryFn: dashboardService.getImportantNotices,
    enabled,
  })
}

export function useRecentActivities(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.activities,
    queryFn: dashboardService.getRecentActivities,
    enabled,
  })
}

export function useBirthdayStudents(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.birthdays,
    queryFn: dashboardService.getBirthdayStudents,
    enabled,
  })
}
