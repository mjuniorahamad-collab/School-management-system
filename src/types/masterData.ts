// Domain types for master data modules. Mirror the backend contracts.

export interface FeeHeadListItem {
  id: string
  code: string
  name: string
  isRecurring: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type FeeHeadDetail = FeeHeadListItem

export interface FeeHeadListResult {
  items: FeeHeadListItem[]
  total: number
}

export interface FeeHeadsQuery {
  search?: string
  includeInactive?: boolean
}

export interface FeeHeadFormPayload {
  code: string
  name: string
  isRecurring?: boolean
  isActive?: boolean
}

export interface ExamTypeListItem {
  id: string
  code: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type ExamTypeDetail = ExamTypeListItem

export interface ExamTypeListResult {
  items: ExamTypeListItem[]
  total: number
}

export interface ExamTypesQuery {
  search?: string
  includeInactive?: boolean
}

export interface ExamTypeFormPayload {
  code: string
  name: string
  sortOrder?: number
  isActive?: boolean
}

export interface GradingBandListItem {
  id: string
  minPercent: number
  maxPercent: number
  grade: string
  description?: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type GradingBandDetail = GradingBandListItem

export interface GradingBandListResult {
  items: GradingBandListItem[]
  total: number
}

export interface GradingBandsQuery {
  search?: string
  includeInactive?: boolean
}

export interface GradingBandFormPayload {
  minPercent: number
  maxPercent: number
  grade: string
  description?: string
  sortOrder?: number
  isActive?: boolean
}

export interface PeriodSlotListItem {
  id: string
  name: string
  startTime: string
  endTime: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PeriodSlotDetail = PeriodSlotListItem

export interface PeriodSlotListResult {
  items: PeriodSlotListItem[]
  total: number
}

export interface PeriodSlotsQuery {
  search?: string
  includeInactive?: boolean
}

export interface PeriodSlotFormPayload {
  name: string
  startTime: string
  endTime: string
  sortOrder?: number
  isActive?: boolean
}
