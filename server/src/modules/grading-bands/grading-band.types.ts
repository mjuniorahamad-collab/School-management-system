export interface GradingBandListItem {
  id: string
  minPercent: number
  maxPercent: number
  grade: string
  description?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type GradingBandDetail = GradingBandListItem

export interface GradingBandListResult {
  items: GradingBandListItem[]
  total: number
}

export interface GradingBandFormPayload {
  minPercent: number
  maxPercent: number
  grade: string
  description?: string
  sortOrder?: number
}
