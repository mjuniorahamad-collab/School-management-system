import type { AcademicSessionStatus } from "@prisma/client"

export type { AcademicSessionStatus }

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

export interface AcademicSessionListQuery {
  status?: AcademicSessionStatus
  search?: string
}

export interface AcademicSessionFormPayload {
  name: string
  code: string
  startDate: string
  endDate: string
  status?: AcademicSessionStatus
}
