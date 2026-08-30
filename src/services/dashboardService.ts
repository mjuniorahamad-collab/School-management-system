import { attendanceData } from "@/data/attendance"
import { recentActivities } from "@/data/activities"
import { topPerformingClasses } from "@/data/classes"
import {
  birthdayStudents,
  dashboardStats,
  feeCollectionStatus,
} from "@/data/dashboard"
import { upcomingEvents } from "@/data/events"
import { feeAnalyticsData } from "@/data/fees"
import { importantNotices } from "@/data/notices"
import { quickActions } from "@/data/quickActions"
import { recentStudents } from "@/data/students"
import type {
  Activity,
  AttendancePeriod,
  AttendanceSummary,
  BirthdayStudent,
  ClassPerformance,
  DashboardStat,
  FeeAnalytics,
  FeeCollectionStatus,
  FeePeriod,
  Notice,
  QuickAction,
  SchoolEvent,
  Student,
} from "@/types"

// Service facade — the ONLY data entry point used by UI components and hooks.
//
// CURRENT STATE: every method resolves TEMPORARY mock data defined under src/data.
// FUTURE STATE: these methods will call the REST API (fetch) without changing any
// UI code. Components must never import src/data directly.

const SIMULATED_LATENCY_MS = 260

function delay<T>(value: T, ms = SIMULATED_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export const dashboardService = {
  getStats(): Promise<DashboardStat[]> {
    return delay(dashboardStats)
  },

  getAttendance(period: AttendancePeriod): Promise<AttendanceSummary> {
    return delay(attendanceData[period])
  },

  getFeeAnalytics(period: FeePeriod): Promise<FeeAnalytics> {
    return delay(feeAnalyticsData[period])
  },

  getFeeCollectionStatus(): Promise<FeeCollectionStatus> {
    return delay(feeCollectionStatus)
  },

  getRecentStudents(): Promise<Student[]> {
    return delay(recentStudents)
  },

  getTopPerformingClasses(): Promise<ClassPerformance[]> {
    return delay(topPerformingClasses)
  },

  getQuickActions(): Promise<QuickAction[]> {
    return delay(quickActions, 40)
  },

  getUpcomingEvents(): Promise<SchoolEvent[]> {
    return delay(upcomingEvents)
  },

  getImportantNotices(): Promise<Notice[]> {
    return delay(importantNotices)
  },

  getRecentActivities(): Promise<Activity[]> {
    return delay(recentActivities)
  },

  getBirthdayStudents(): Promise<BirthdayStudent[]> {
    return delay(birthdayStudents)
  },
}