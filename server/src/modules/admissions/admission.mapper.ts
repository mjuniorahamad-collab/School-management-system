import type { AdmissionApplication, GuardianRelationshipType, StudentGender } from "@prisma/client"
import type { AdmissionDetail, AdmissionListItem } from "./admission.types.js"

type ApplicationRow = AdmissionApplication & {
  preferredAcademicSession?: { id: string; name: string; code: string; status: string } | null
  preferredClass?: { id: string; name: string } | null
  preferredSection?: { id: string; name: string } | null
}

export function toAdmissionListItem(application: ApplicationRow): AdmissionListItem {
  return {
    id: application.id,
    applicationNumber: application.applicationNumber,
    firstName: application.firstName,
    middleName: application.middleName,
    lastName: application.lastName,
    name: [application.firstName, application.middleName, application.lastName]
      .filter(Boolean)
      .join(" "),
    gender: application.gender as StudentGender,
    dateOfBirth: application.dateOfBirth.toISOString(),
    status: application.status,
    email: application.email,
    phone: application.phone,
    city: application.city,
    state: application.state,
    guardianName: application.guardianName,
    preferredClass: application.preferredClass ?? null,
    preferredSection: application.preferredSection ?? null,
    createdAt: application.createdAt.toISOString(),
  }
}

export function toAdmissionDetail(application: ApplicationRow): AdmissionDetail {
  const item = toAdmissionListItem(application)
  return {
    ...item,
    addressLine1: application.addressLine1,
    addressLine2: application.addressLine2,
    postalCode: application.postalCode,
    guardianPhone: application.guardianPhone,
    guardianEmail: application.guardianEmail,
    guardianRelationshipType: application.guardianRelationshipType as GuardianRelationshipType,
    preferredAcademicSession: application.preferredAcademicSession ?? null,
    preferredClass: application.preferredClass ?? null,
    preferredSection: application.preferredSection ?? null,
    reviewNote: application.reviewNote,
    reviewedBy: application.reviewedBy,
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    convertedStudentId: application.convertedStudentId,
    convertedAt: application.convertedAt?.toISOString() ?? null,
    updatedAt: application.updatedAt.toISOString(),
  }
}
