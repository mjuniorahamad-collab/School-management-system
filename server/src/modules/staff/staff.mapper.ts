import { Prisma } from "@prisma/client"
import type { StaffDetail, StaffListItem } from "./staff.types.js"

export const DETAIL_INCLUDE = {} satisfies Prisma.StaffInclude

export type StaffDetailRow = Prisma.StaffGetPayload<{ include: typeof DETAIL_INCLUDE }>
export type StaffListItemRow = Prisma.StaffGetPayload<Record<string, never>>

export function buildStaffName(staff: {
  firstName: string
  middleName: string | null
  lastName: string | null
}): string {
  return [staff.firstName, staff.middleName, staff.lastName]
    .filter((part): part is string => part !== null && part !== "")
    .join(" ")
}

export function mapStaffDetail(row: StaffDetailRow): StaffDetail {
  return {
    id: row.id,
    employeeId: row.employeeId,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    name: buildStaffName(row),
    gender: row.gender,
    department: row.department,
    designation: row.designation,
    phone: row.phone,
    email: row.email,
    status: row.status,
    joiningDate: row.joiningDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dateOfBirth: row.dateOfBirth?.toISOString() ?? null,
    address: row.address,
    qualification: row.qualification,
    experience: row.experience,
    photoUrl: row.photoUrl,
    emergencyContactName: row.emergencyContactName,
    emergencyContactRelationship: row.emergencyContactRelationship,
    emergencyContactPhone: row.emergencyContactPhone,
  }
}

export function mapStaffListItem(row: StaffListItemRow): StaffListItem {
  return {
    id: row.id,
    employeeId: row.employeeId,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    name: buildStaffName(row),
    gender: row.gender,
    department: row.department,
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
