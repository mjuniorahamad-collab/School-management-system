// Domain types for the Subjects module. Mirrors the backend contract
// (server/src/modules/subjects/subject.types.ts).

export interface SubjectListItem {
  id: string
  code: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type SubjectDetail = SubjectListItem

export interface SubjectListResult {
  items: SubjectListItem[]
  total: number
}

export interface SubjectsQuery {
  search?: string
}

export interface SubjectFormPayload {
  code: string
  name: string
  sortOrder?: number
}
