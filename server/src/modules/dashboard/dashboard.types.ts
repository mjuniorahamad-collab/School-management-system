export interface DashboardStatItem {
  id: string
  label: string
  value: string
  trendPercent: number
  comparison: string
}

export interface DashboardStatsResult {
  stats: DashboardStatItem[]
}

export interface DashboardAttendanceResult {
  total: number
  present: number
  late: number
  absent: number
  average: number
}

export interface DashboardFeeMonthPoint {
  label: string
  collected: number
}

export interface DashboardFeeAnalyticsResult {
  totalCollected: number
  trendPercent: number
  comparison: string
  months: DashboardFeeMonthPoint[]
}

export interface DashboardFeeCollectionStatusResult {
  collected: number
  pending: number
  total: number
}

export interface DashboardClassPerformanceItem {
  rank: number
  name: string
  performance: number
  students: number
}

export interface DashboardTopClassesResult {
  context: {
    examName: string | null
    academicSessionName: string
    from: string | null
    to: string | null
  } | null
  classes: DashboardClassPerformanceItem[]
}

export interface DashboardRecentStudentItem {
  id: string
  name: string
  studentClass: string
  section: string
  status: string
}

export interface DashboardUpcomingEventItem {
  id: string
  title: string
  date: string
  time: string
  category: string
}

export interface DashboardNoticeItem {
  id: string
  title: string
  summary: string
  publishedAt: string
  priority: string
}

export interface DashboardActivityItem {
  id: string
  action: string
  entity: string
  timestamp: string
  tone: string
}

export interface DashboardBirthdayStudentItem {
  id: string
  name: string
  studentClass: string
  age: number
}
