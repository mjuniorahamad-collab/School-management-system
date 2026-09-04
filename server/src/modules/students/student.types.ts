// API response shapes for the Students module. Mirrors the frontend contract
// in `src/types/students.ts` — keep both in sync (AGENTS.md §6).

export type { StudentGender, StudentStatus, GuardianRelationshipType } from "@prisma/client"

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface StudentListResult {
  items: StudentListItem[]
  pagination: Pagination
}

export interface StudentListItem {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
  name: string
  gender: string
  status: string
  photoUrl: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  primaryGuardian: { id: string; name: string; phone: string | null } | null
  admissionDate: string
  dateOfBirth: string
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
}

export interface StudentGuardianDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  relationshipType: string
  isPrimary: boolean
  isEmergencyContact: boolean
}

export interface EnrollmentDetail {
  academicSession: { id: string; name: string; code: string; status: string }
  class: { id: string; name: string }
  section: { id: string; name: string } | null
}

export interface StudentDetail {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
  name: string
  dateOfBirth: string
  gender: string
  photoUrl: string | null
  status: string
  email: string | null
  phone: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  admissionDate: string
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  enrollment: EnrollmentDetail | null
  guardians: StudentGuardianDetail[]
  createdAt: string
  updatedAt: string
}

export interface AcademicMetaSession {
  id: string
  name: string
  code: string
  status: string
}

export interface AcademicMetaClass {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

export interface StudentFiltersMeta {
  academicSessions: AcademicMetaSession[]
  classes: AcademicMetaClass[]
}