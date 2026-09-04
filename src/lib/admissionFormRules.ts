import type {
  AdmissionFormPayload,
  GuardianRelationshipType,
  StudentGender,
} from "@/types/admissions"

export interface AdmissionFormValue {
  firstName: string
  middleName: string
  lastName: string
  dateOfBirth: string
  gender: StudentGender
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  preferredAcademicSessionId: string
  preferredClassId: string
  preferredSectionId: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  guardianRelationshipType: GuardianRelationshipType
}

export interface AdmissionFormValidationError {
  field: keyof AdmissionFormValue
  message: string
}

const GENDERS: StudentGender[] = ["MALE", "FEMALE", "OTHER"]
const RELATIONSHIPS: GuardianRelationshipType[] = [
  "FATHER",
  "MOTHER",
  "PARENT",
  "GUARDIAN",
  "LEGAL_GUARDIAN",
  "OTHER",
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateAdmissionForm(value: AdmissionFormValue): AdmissionFormValidationError[] {
  const errors: AdmissionFormValidationError[] = []
  if (!value.firstName.trim()) {
    errors.push({ field: "firstName", message: "First name is required" })
  }
  if (!DATE_RE.test(value.dateOfBirth)) {
    errors.push({ field: "dateOfBirth", message: "Use YYYY-MM-DD format" })
  }
  if (!GENDERS.includes(value.gender)) {
    errors.push({ field: "gender", message: "Select a gender" })
  }
  if (value.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
    errors.push({ field: "email", message: "Enter a valid email address" })
  }
  if (!value.guardianName.trim()) {
    errors.push({ field: "guardianName", message: "Guardian name is required" })
  }
  if (!value.guardianPhone.trim() && !value.guardianEmail.trim()) {
    errors.push({
      field: "guardianPhone",
      message: "Provide at least one of guardian phone or email",
    })
  }
  if (
    value.guardianEmail.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.guardianEmail.trim())
  ) {
    errors.push({ field: "guardianEmail", message: "Enter a valid email address" })
  }
  if (!RELATIONSHIPS.includes(value.guardianRelationshipType)) {
    errors.push({ field: "guardianRelationshipType", message: "Select a relationship" })
  }
  return errors
}

function orUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function admissionFormToPayload(value: AdmissionFormValue): AdmissionFormPayload {
  return {
    firstName: value.firstName.trim(),
    middleName: value.middleName.trim() || null,
    lastName: value.lastName.trim() || null,
    dateOfBirth: value.dateOfBirth,
    gender: value.gender,
    email: orUndefined(value.email),
    phone: orUndefined(value.phone),
    addressLine1: orUndefined(value.addressLine1),
    addressLine2: orUndefined(value.addressLine2),
    city: orUndefined(value.city),
    state: orUndefined(value.state),
    postalCode: orUndefined(value.postalCode),
    preferredAcademicSessionId: orUndefined(value.preferredAcademicSessionId),
    preferredClassId: orUndefined(value.preferredClassId),
    preferredSectionId: orUndefined(value.preferredSectionId),
    guardianName: value.guardianName.trim(),
    guardianPhone: orUndefined(value.guardianPhone),
    guardianEmail: orUndefined(value.guardianEmail),
    guardianRelationshipType: value.guardianRelationshipType,
  }
}

export function defaultAdmissionForm(): AdmissionFormValue {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "MALE",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    preferredAcademicSessionId: "",
    preferredClassId: "",
    preferredSectionId: "",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
    guardianRelationshipType: "PARENT",
  }
}

export function admissionDetailToForm(detail: {
  firstName: string
  middleName: string | null
  lastName: string | null
  dateOfBirth: string
  gender: StudentGender
  email: string | null
  phone: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  preferredAcademicSessionId?: string | null
  preferredClassId?: string | null
  preferredSectionId?: string | null
  guardianName: string
  guardianPhone: string | null
  guardianEmail: string | null
  guardianRelationshipType: GuardianRelationshipType
}): AdmissionFormValue {
  return {
    firstName: detail.firstName,
    middleName: detail.middleName ?? "",
    lastName: detail.lastName ?? "",
    dateOfBirth: detail.dateOfBirth.slice(0, 10),
    gender: detail.gender,
    email: detail.email ?? "",
    phone: detail.phone ?? "",
    addressLine1: detail.addressLine1 ?? "",
    addressLine2: detail.addressLine2 ?? "",
    city: detail.city ?? "",
    state: detail.state ?? "",
    postalCode: detail.postalCode ?? "",
    preferredAcademicSessionId: detail.preferredAcademicSessionId ?? "",
    preferredClassId: detail.preferredClassId ?? "",
    preferredSectionId: detail.preferredSectionId ?? "",
    guardianName: detail.guardianName,
    guardianPhone: detail.guardianPhone ?? "",
    guardianEmail: detail.guardianEmail ?? "",
    guardianRelationshipType: detail.guardianRelationshipType,
  }
}
