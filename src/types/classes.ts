// Domain types for the Classes module. Mirrors the backend contract
// (server/src/modules/classes/class.types.ts).

export interface ClassListItem {
  id: string
  name: string
  sortOrder: number
  sectionCount: number
  studentCount: number
  createdAt: string
  updatedAt: string
}

export interface ClassDetail extends ClassListItem {
  sections: { id: string; name: string }[]
}

export interface ClassListResult {
  items: ClassListItem[]
  total: number
}

export interface ClassesQuery {
  search?: string
}

export interface ClassFormPayload {
  name: string
  sortOrder?: number
}
