// Domain types for the Academic Sessions module. Mirrors the backend contract
// (server/src/modules/academic-sessions/academic-session.types.ts).

export const SESSION_STATUS_OPTIONS = ["UPCOMING", "ACTIVE", "CLOSED"] as const

export type AcademicSessionStatus = (typeof SESSION_STATUS_OPTIONS)[number]

export interface AcademicSessionListItem {
  id: string
  name: string
  code: string
  startDate: string
  endDate: string
  status: AcademicSessionStatus
  createdAt: string
  updatedAt: string
}

export type AcademicSessionDetail = AcademicSessionListItem

export interface AcademicSessionListResult {
  items: AcademicSessionListItem[]
  total: number
}

export interface AcademicSessionsQuery {
  search?: string
  status?: AcademicSessionStatus
}

export interface AcademicSessionFormPayload {
  name: string
  code: string
  startDate: string
  endDate: string
  status?: AcademicSessionStatus
}
