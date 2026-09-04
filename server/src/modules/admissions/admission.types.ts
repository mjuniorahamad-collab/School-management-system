// API response shapes for the Admissions module. Mirrors the frontend contract
// in `src/types/admissions.ts` — keep both in sync (AGENTS.md §6).

export type { StudentGender, GuardianRelationshipType } from "@prisma/client"
export type { AdmissionApplicationStatus } from "@prisma/client"

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AdmissionListResult {
  items: AdmissionListItem[]
  pagination: Pagination
}

export interface AdmissionListItem {
  id: string
  applicationNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
  name: string
  gender: string
  dateOfBirth: string
  status: string
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  guardianName: string
  preferredClass: { id: string; name: string } | null
  preferredSection: { id: string; name: string } | null
  createdAt: string
}

export interface AdmissionDetail {
  id: string
  applicationNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
  name: string
  dateOfBirth: string
  gender: string
  status: string
  email: string | null
  phone: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  guardianName: string
  guardianPhone: string | null
  guardianEmail: string | null
  guardianRelationshipType: string
  preferredAcademicSession: { id: string; name: string; code: string; status: string } | null
  preferredClass: { id: string; name: string } | null
  preferredSection: { id: string; name: string } | null
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  convertedStudentId: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdmissionConvertResult {
  application: AdmissionDetail
  student: {
    id: string
    admissionNumber: string
    name: string
    class: { id: string; name: string } | null
    section: { id: string; name: string } | null
  }
}

export interface AdmissionMeta {
  academicSessions: {
    id: string
    name: string
    code: string
    status: string
  }[]
  classes: {
    id: string
    name: string
    sections: { id: string; name: string }[]
  }[]
}
