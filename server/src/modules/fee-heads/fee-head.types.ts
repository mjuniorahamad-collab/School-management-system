export interface FeeHeadListItem {
  id: string
  code: string
  name: string
  isRecurring: boolean
  createdAt: string
  updatedAt: string
}

export type FeeHeadDetail = FeeHeadListItem

export interface FeeHeadListResult {
  items: FeeHeadListItem[]
  total: number
}

export interface FeeHeadFormPayload {
  code: string
  name: string
  isRecurring?: boolean
}
