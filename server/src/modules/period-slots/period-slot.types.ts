export interface PeriodSlotListItem {
  id: string
  name: string
  startTime: string
  endTime: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type PeriodSlotDetail = PeriodSlotListItem

export interface PeriodSlotListResult {
  items: PeriodSlotListItem[]
  total: number
}

export interface PeriodSlotFormPayload {
  name: string
  startTime: string
  endTime: string
  sortOrder?: number
}
