// Domain types for the Sections module. Mirrors the backend contract
// (server/src/modules/sections/section.types.ts).

export interface SectionListItem {
  id: string
  classId: string
  className: string
  name: string
  studentCount: number
  createdAt: string
  updatedAt: string
}

export type SectionDetail = SectionListItem

export interface SectionListResult {
  items: SectionListItem[]
  total: number
}

export interface SectionsQuery {
  classId?: string
  search?: string
}

export interface SectionFormPayload {
  classId: string
  name: string
}
