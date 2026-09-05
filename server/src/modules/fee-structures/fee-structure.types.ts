export interface FeeStructureItemDetail {
  id: string
  feeHead: {
    id: string
    code: string
    name: string
    isRecurring: boolean
  }
  amount: number
  sortOrder: number
}

export interface FeeStructureDetail {
  id: string
  name: string
  isActive: boolean
  totalAmount: number
  session: { id: string; name: string; code: string; status: string }
  class: { id: string; name: string }
  items: FeeStructureItemDetail[]
  createdAt: string
  updatedAt: string
}

export interface FeeStructureListItem {
  id: string
  name: string
  isActive: boolean
  totalAmount: number
  session: { id: string; name: string }
  class: { id: string; name: string }
  itemCount: number
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface FeeStructureListResult {
  items: FeeStructureListItem[]
  pagination: Pagination
}