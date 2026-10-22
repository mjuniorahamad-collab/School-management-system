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

export interface ExamTypeFormPayload {
  code: string
  name: string
  sortOrder?: number
  isActive?: boolean
}
