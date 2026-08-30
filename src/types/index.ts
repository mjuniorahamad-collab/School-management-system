import type { LucideIcon } from "lucide-react"

export type AttendanceStatus = "present" | "late" | "absent"

export interface Student {
  id: string
  name: string
  studentClass: string
  section: string
  status: AttendanceStatus
  enrolledOn?: string
}

export type TrendTone = "positive" | "negative" | "neutral"

export interface DashboardStat {
  id: string
  label: string
  value: string
  trendPercent: number
  comparison: string
  icon: LucideIcon
  tone: "primary" | "emerald" | "amber" | "sky"
}

export type AttendancePeriod = "today" | "week" | "month"

export interface AttendanceSummary {
  total: number
  present: number
  late: number
  absent: number
  average: number
}

export type FeePeriod = "month" | "session" | "year"

export interface FeeMonthPoint {
  label: string
  collected: number
}

export interface FeeAnalytics {
  totalCollected: number
  trendPercent: number
  comparison: string
  months: FeeMonthPoint[]
}

export interface FeeCollectionStatus {
  collected: number
  pending: number
  total: number
}

export interface ClassPerformance {
  rank: number
  name: string
  performance: number
  students: number
}

export type EventCategory = "sports" | "academic" | "community"

export interface SchoolEvent {
  id: string
  title: string
  date: string
  time: string
  category: EventCategory
}

export type NoticePriority = "high" | "medium" | "low"

export interface Notice {
  id: string
  title: string
  summary: string
  publishedAt: string
  priority: NoticePriority
}

export type ActivityTone = "success" | "info" | "warning" | "neutral"

export interface Activity {
  id: string
  action: string
  entity: string
  timestamp: string
  tone: ActivityTone
}

export interface BirthdayStudent {
  id: string
  name: string
  studentClass: string
  age: number
}

export interface QuickAction {
  id: string
  label: string
  description: string
  icon: LucideIcon
}

export type ModuleStatus = "planned" | "in-progress" | "ready"

export interface ModuleMeta {
  path: string
  label: string
  status: ModuleStatus
  purpose: string
  futureConnection: string
}

export type NavSectionId =
  | "overview"
  | "academics"
  | "finance"
  | "services"
  | "communication"
  | "insights"
  | "system"

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  keywords?: string[]
}

export interface NavSection {
  id: NavSectionId
  label: string
  items: NavItem[]
}

export type { LucideIcon }