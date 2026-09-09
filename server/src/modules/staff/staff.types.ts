// API response shapes for the Staff module. Mirrors the frontend contract
// in `src/types/staff.ts` — keep both in sync (AGENTS.md §6).

export type { StudentGender as StaffGender, EmployeeStatus } from "@prisma/client"

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
