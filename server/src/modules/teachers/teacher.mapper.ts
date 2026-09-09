import { Prisma } from "@prisma/client"
import type { TeacherDetail, TeacherListItem } from "./teacher.types.js"

export const DETAIL_INCLUDE = {
  teacherSubjects: {
    include: { subject: true },
  },
  teacherClasses: {
    include: { class: true, section: true },
  },
} satisfies Prisma.TeacherInclude

export type TeacherDetailRow = Prisma.TeacherGetPayload<{ include: typeof DETAIL_INCLUDE }>
export type TeacherListItemRow = Prisma.TeacherGetPayload<Record<string, never>>

export function buildTeacherName(teacher: {
  firstName: string
  middleName: string | null
  lastName: string | null
}): string {
  return [teacher.firstName, teacher.middleName, teacher.lastName]
    .filter((part): part is string => part !== null && part !== "")
    .join(" ")
}

export function mapTeacherDetail(row: TeacherDetailRow): TeacherDetail {
  return {
    id: row.id,
    employeeId: row.employeeId,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    name: buildTeacherName(row),
    gender: row.gender,
    designation: row.designation,
    phone: row.phone,
    email: row.email,
    status: row.status,
    joiningDate: row.joiningDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
    dateOfBirth: row.dateOfBirth?.toISOString() ?? null,
    address: row.address,
    qualification: row.qualification,
    experience: row.experience,
    photoUrl: row.photoUrl,
    subjects: row.teacherSubjects.map((ts) => ({
      id: ts.subject.id,
      code: ts.subject.code,
      name: ts.subject.name,
    })),
    classAssignments: row.teacherClasses.map((tc) => ({
      className: tc.class.name,
      sectionName: tc.section?.name ?? null,
    })),
  }
}

export function mapTeacherListItem(row: TeacherListItemRow): TeacherListItem {
  return {
    id: row.id,
    employeeId: row.employeeId,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    name: buildTeacherName(row),
    gender: row.gender,
    designation: row.designation,
    phone: row.phone,
    email: row.email,
    status: row.status,
    joiningDate: row.joiningDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    photoUrl: row.photoUrl,
  }
}
