// Dashboard — real-data contract (mirrors server/src/modules/dashboard/dashboard.types.ts).
// Wire types returned by the dashboard aggregation API. Keep in sync with the backend.

export type DashboardStatTone = "primary" | "emerald" | "amber" | "sky"

export interface DashboardStatItem {
  id: string
  label: string
  value: string
  trendPercent: number
  comparison: string
}

export type AttendancePeriod = "today" | "week" | "month"

export interface DashboardAttendance {
  total: number
  present: number
  late: number
  absent: number
  average: number
}

export type FeePeriod = "month" | "session" | "year"

export interface DashboardFeeMonthPoint {
  label: string
  collected: number
}

export interface DashboardFeeAnalytics {
  totalCollected: number
  trendPercent: number
  comparison: string
  months: DashboardFeeMonthPoint[]
}

export interface DashboardFeeCollectionStatus {
  collected: number
  pending: number
  total: number
}

export interface DashboardClassPerformance {
  rank: number
  name: string
  performance: number
  students: number
}

export interface DashboardTopClasses {
  context: {
    examName: string | null
    academicSessionName: string
    from: string | null
    to: string | null
  } | null
  classes: DashboardClassPerformance[]
}

export interface DashboardRecentStudent {
  id: string
  name: string
  studentClass: string
  section: string
  status: "ACTIVE" | "INACTIVE" | "TRANSFERRED" | "WITHDRAWN" | "GRADUATED"
}

export type DashboardEventCategory = "sports" | "academic" | "community"

export interface DashboardUpcomingEvent {
  id: string
  title: string
  date: string
  time: string
  category: DashboardEventCategory
}

export type DashboardNoticePriority = "high" | "medium" | "low"

export interface DashboardNotice {
  id: string
  title: string
  summary: string
  publishedAt: string
  priority: DashboardNoticePriority
}

export type DashboardActivityTone = "success" | "info" | "warning" | "neutral"

export interface DashboardActivity {
  id: string
  action: string
  entity: string
  timestamp: string
  tone: DashboardActivityTone
}

export interface DashboardBirthdayStudent {
  id: string
  name: string
  studentClass: string
  age: number
}
