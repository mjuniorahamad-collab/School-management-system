// Domain types for the Teachers module. Mirrors the backend contract
// (server/src/modules/teachers/teacher.types.ts).

export type TeacherGender = "MALE" | "FEMALE" | "OTHER"
export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE"

export const TEACHER_GENDER_OPTIONS: readonly TeacherGender[] = ["MALE", "FEMALE", "OTHER"]
export const EMPLOYEE_STATUS_OPTIONS: readonly EmployeeStatus[] = ["ACTIVE", "INACTIVE", "ON_LEAVE"]

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ON_LEAVE: "On Leave",
}

export interface TeacherListItem {
  id: string
  employeeId: string
  firstName: string
  middleName: string | null
  lastName: string | null
  name: string
  gender: string
  designation: string
  phone: string | null
  email: string | null
  status: string
  joiningDate: string
  createdAt: string
  updatedAt: string
}

export interface TeacherSubjectAssignment {
  id: string
  code: string
  name: string
}

export interface TeacherClassAssignment {
  className: string
  sectionName: string | null
}

export interface TeacherDetail extends TeacherListItem {
  dateOfBirth: string | null
  address: string | null
  qualification: string | null
  experience: number | null
  photoUrl: string | null
  subjects: TeacherSubjectAssignment[]
  classAssignments: TeacherClassAssignment[]
}

export interface TeacherListResult {
  items: TeacherListItem[]
  total: number
}

export interface TeacherMetaSubject {
  id: string
  code: string
  name: string
}

export interface TeacherMetaClassSection {
  id: string
  name: string
}

export interface TeacherMetaClass {
  id: string
  name: string
  sections: TeacherMetaClassSection[]
}

export interface TeacherMeta {
  subjects: TeacherMetaSubject[]
  classes: TeacherMetaClass[]
}

export interface TeachersQuery {
  search?: string
  status?: string
  designation?: string
  gender?: string
  page?: number
  pageSize?: number
}

export interface TeacherFormPayload {
  firstName: string
  middleName?: string | null
  lastName?: string | null
  gender: string
  dateOfBirth?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  designation: string
  qualification?: string | null
  experience?: number | null
  joiningDate: string
  status?: string
  subjectIds?: string[]
  classAssignments?: { classId: string; sectionId?: string | null }[]
}
