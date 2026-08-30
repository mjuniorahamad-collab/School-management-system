// Domain types for the Students module. Mirrors the backend contract
// (server/src/modules/students/student.types.ts).

export type StudentGender = "MALE" | "FEMALE" | "OTHER"

export type StudentStatus = "ACTIVE" | "INACTIVE" | "TRANSFERRED" | "WITHDRAWN" | "GRADUATED"

export const STUDENT_STATUS_OPTIONS: readonly StudentStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "TRANSFERRED",
  "WITHDRAWN",
  "GRADUATED",
]

export const STUDENT_GENDER_OPTIONS: readonly StudentGender[] = ["MALE", "FEMALE", "OTHER"]

export const GUARDIAN_RELATIONSHIP_OPTIONS: readonly GuardianRelationshipType[] = [
  "FATHER",
  "MOTHER",
  "PARENT",
  "GUARDIAN",
  "LEGAL_GUARDIAN",
  "OTHER",
]

export type GuardianRelationshipType =
  | "FATHER"
  | "MOTHER"
  | "PARENT"
  | "GUARDIAN"
  | "LEGAL_GUARDIAN"
  | "OTHER"

export type AcademicSessionStatus = "UPCOMING" | "ACTIVE" | "ARCHIVED"

export interface ClassOption {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

export interface AcademicSessionOption {
  id: string
  name: string
  code: string
  status: AcademicSessionStatus
}

export interface StudentsMeta {
  academicSessions: AcademicSessionOption[]
  classes: ClassOption[]
}

export interface StudentListItem {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string
  name: string
  gender: StudentGender
  status: StudentStatus
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

export interface StudentEnrollmentDetail {
  academicSession: { id: string; name: string; code: string; status: AcademicSessionStatus }
  class: { id: string; name: string }
  section: { id: string; name: string }
}

export interface StudentGuardianDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  relationshipType: GuardianRelationshipType
  isPrimary: boolean
  isEmergencyContact: boolean
}

export interface StudentDetail {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string
  name: string
  dateOfBirth: string
  gender: StudentGender
  photoUrl: string | null
  status: StudentStatus
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
  enrollment: StudentEnrollmentDetail | null
  guardians: StudentGuardianDetail[]
  createdAt: string
  updatedAt: string
}

export interface StudentsPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface StudentListResult {
  items: StudentListItem[]
  pagination: StudentsPagination
}

export interface StudentsQuery {
  page: number
  pageSize: number
  search?: string
  status?: StudentStatus
  sessionId?: string
  classId?: string
  sectionId?: string
  sortBy?: "name" | "admissionNumber" | "admissionDate"
  sortDir?: "asc" | "desc"
}

export interface StudentGuardianInput {
  name: string
  relationshipType: GuardianRelationshipType
  isPrimary: boolean
  isEmergencyContact: boolean
  email?: string
  phone?: string
  address?: string
}

export interface StudentFormPayload {
  firstName: string
  middleName?: string
  lastName: string
  dateOfBirth: string
  gender: StudentGender
  email?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  admissionDate: string
  status?: StudentStatus
  academicSessionId?: string
  classId: string
  sectionId: string
  guardians: StudentGuardianInput[]
}