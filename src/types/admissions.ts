// Domain types for the Admissions module. Mirrors the backend contract
// (server/src/modules/admissions/admission.types.ts).

export type StudentGender = "MALE" | "FEMALE" | "OTHER"

export type AdmissionApplicationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "CONVERTED"

export const ADMISSION_STATUS_OPTIONS: readonly AdmissionApplicationStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "CONVERTED",
]

export type GuardianRelationshipType =
  | "FATHER"
  | "MOTHER"
  | "PARENT"
  | "GUARDIAN"
  | "LEGAL_GUARDIAN"
  | "OTHER"

export const GUARDIAN_RELATIONSHIP_OPTIONS: readonly GuardianRelationshipType[] = [
  "FATHER",
  "MOTHER",
  "PARENT",
  "GUARDIAN",
  "LEGAL_GUARDIAN",
  "OTHER",
]

export type AcademicSessionStatus = "UPCOMING" | "ACTIVE" | "CLOSED"

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

export interface AdmissionsMeta {
  academicSessions: AcademicSessionOption[]
  classes: ClassOption[]
}

export interface AdmissionListItem {
  id: string
  applicationNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
  name: string
  gender: StudentGender
  dateOfBirth: string
  status: AdmissionApplicationStatus
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
  gender: StudentGender
  status: AdmissionApplicationStatus
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
  guardianRelationshipType: GuardianRelationshipType
  preferredAcademicSession: {
    id: string
    name: string
    code: string
    status: AcademicSessionStatus
  } | null
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

export type AdmissionDetailInput = Omit<AdmissionDetail, "convertedAt" | "convertedStudentId">

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

export interface AdmissionsPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AdmissionListResult {
  items: AdmissionListItem[]
  pagination: AdmissionsPagination
}

export interface AdmissionsQuery {
  page: number
  pageSize: number
  search?: string
  status?: AdmissionApplicationStatus
  sortBy?: "name" | "applicationNumber" | "createdAt"
  sortDir?: "asc" | "desc"
}

export interface AdmissionFormPayload {
  firstName: string
  middleName?: string | null
  lastName?: string | null
  dateOfBirth: string
  gender: StudentGender
  email?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  preferredAcademicSessionId?: string
  preferredClassId?: string
  preferredSectionId?: string
  guardianName: string
  guardianPhone?: string
  guardianEmail?: string
  guardianRelationshipType?: GuardianRelationshipType
}

export interface ReviewAdmissionPayload {
  status: "APPROVED" | "REJECTED" | "WITHDRAWN"
  note?: string
}

export interface ConvertAdmissionPayload {
  academicSessionId?: string
  classId: string
  sectionId?: string
}
