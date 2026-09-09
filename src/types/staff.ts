// Domain types for the Staff module. Mirrors the backend contract
// (server/src/modules/staff/staff.types.ts).

export type StaffGender = "MALE" | "FEMALE" | "OTHER"
export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE"

export const STAFF_GENDER_OPTIONS: readonly StaffGender[] = ["MALE", "FEMALE", "OTHER"]
export const EMPLOYEE_STATUS_OPTIONS: readonly EmployeeStatus[] = ["ACTIVE", "INACTIVE", "ON_LEAVE"]

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ON_LEAVE: "On Leave",
}

export interface StaffListItem {
  id: string
  employeeId: string
  firstName: string
  middleName: string | null
  lastName: string | null
  name: string
  gender: string
  department: string
  designation: string
  phone: string | null
  email: string | null
  status: string
  joiningDate: string
  createdAt: string
  updatedAt: string
  photoUrl: string | null
}

export interface StaffDetail extends StaffListItem {
  dateOfBirth: string | null
  address: string | null
  qualification: string | null
  experience: number | null
  photoUrl: string | null
  emergencyContactName: string | null
  emergencyContactRelationship: string | null
  emergencyContactPhone: string | null
}

export interface StaffListResult {
  items: StaffListItem[]
  total: number
}

export interface StaffMeta {
  departments: string[]
  designations: string[]
}

export interface StaffsQuery {
  search?: string
  status?: string
  department?: string
  designation?: string
  gender?: string
  page?: number
  pageSize?: number
}

export interface StaffFormPayload {
  firstName: string
  middleName?: string | null
  lastName?: string | null
  gender: string
  dateOfBirth?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  department: string
  designation: string
  qualification?: string | null
  experience?: number | null
  joiningDate: string
  status?: string
  emergencyContactName?: string | null
  emergencyContactRelationship?: string | null
  emergencyContactPhone?: string | null
}
