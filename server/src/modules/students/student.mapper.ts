import { Prisma } from "@prisma/client"
import type { StudentDetail, StudentListItem } from "./student.types.js"

export const DETAIL_INCLUDE = {
  studentGuardians: {
    include: { guardian: true },
    orderBy: { createdAt: "asc" as const },
  },
  enrollments: {
    include: { academicSession: true, class: true, section: true },
    orderBy: { academicSession: { startDate: "desc" as const } },
  },
} satisfies Prisma.StudentInclude

/** List include scoped to the resolved academic session (current placement). */
export const LIST_INCLUDE = (academicSessionId: string | null) =>
  ({
    enrollments: {
      where: academicSessionId ? { academicSessionId } : {},
      include: { class: true, section: true },
      take: 1,
    },
    studentGuardians: { where: { isPrimary: true }, include: { guardian: true }, take: 1 },
  }) satisfies Prisma.StudentInclude

export type StudentDetailRow = Prisma.StudentGetPayload<{ include: typeof DETAIL_INCLUDE }>
export type StudentListItemRow = Prisma.StudentGetPayload<{ include: ReturnType<typeof LIST_INCLUDE> }>

export function buildStudentName(student: {
  firstName: string
  middleName: string | null
  lastName: string | null
}): string {
  return [student.firstName, student.middleName, student.lastName]
    .filter((part): part is string => part !== null && part !== "")
    .join(" ")
}

export function mapStudentDetail(row: StudentDetailRow): StudentDetail {
  const enrollment =
    row.enrollments.find((candidate) => candidate.academicSession.status === "ACTIVE") ??
    row.enrollments[0] ??
    null

  return {
    id: row.id,
    admissionNumber: row.admissionNumber,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    name: buildStudentName(row),
    dateOfBirth: row.dateOfBirth.toISOString(),
    gender: row.gender,
    photoUrl: row.photoUrl,
    status: row.status,
    email: row.email,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    admissionDate: row.admissionDate.toISOString(),
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    enrollment: enrollment
      ? {
          academicSession: {
            id: enrollment.academicSession.id,
            name: enrollment.academicSession.name,
            code: enrollment.academicSession.code,
            status: enrollment.academicSession.status,
          },
          class: { id: enrollment.class.id, name: enrollment.class.name },
          section: enrollment.section
            ? { id: enrollment.section.id, name: enrollment.section.name }
            : null,
        }
      : null,
    guardians: row.studentGuardians.map((sg) => ({
      id: sg.guardian.id,
      name: sg.guardian.name,
      email: sg.guardian.email,
      phone: sg.guardian.phone,
      relationshipType: sg.relationshipType,
      isPrimary: sg.isPrimary,
      isEmergencyContact: sg.isEmergencyContact,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function mapStudentListItem(row: StudentListItemRow): StudentListItem {
  const enrollment = row.enrollments[0] ?? null
  const primaryGuardian = row.studentGuardians[0]?.guardian ?? null

  return {
    id: row.id,
    admissionNumber: row.admissionNumber,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    name: buildStudentName(row),
    gender: row.gender,
    status: row.status,
    photoUrl: row.photoUrl,
    class: enrollment ? { id: enrollment.class.id, name: enrollment.class.name } : null,
    section: enrollment?.section
      ? { id: enrollment.section.id, name: enrollment.section.name }
      : null,
    primaryGuardian: primaryGuardian
      ? { id: primaryGuardian.id, name: primaryGuardian.name, phone: primaryGuardian.phone }
      : null,
    admissionDate: row.admissionDate.toISOString(),
    dateOfBirth: row.dateOfBirth.toISOString(),
    email: row.email,
    phone: row.phone,
    city: row.city,
    state: row.state,
  }
}