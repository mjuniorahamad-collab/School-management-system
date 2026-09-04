// API response shapes for the Teachers module. Mirrors the frontend contract
// in `src/types/teachers.ts` — keep both in sync (AGENTS.md §6).

export type { StudentGender as TeacherGender, EmployeeStatus } from "@prisma/client"

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
  userId: string | null
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
  userId?: string | null
  subjectIds?: string[]
  classAssignments?: { classId: string; sectionId?: string | null }[]
}
