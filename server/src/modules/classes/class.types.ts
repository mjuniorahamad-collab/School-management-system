export interface SectionLink {
  id: string
  name: string
}

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
  sections: SectionLink[]
}

export interface ClassListResult {
  items: ClassListItem[]
  total: number
}

export interface ClassListQuery {
  search?: string
}

export interface ClassFormPayload {
  name: string
  sortOrder?: number
}
