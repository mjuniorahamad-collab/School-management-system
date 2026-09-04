import type { TaskStatus } from "../tasks/task-rules.js"

export type AssignmentStatus = TaskStatus

export interface AssignmentListItem {
  id: string
  academicSessionId: string
  academicSessionName: string
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  subjectId: string
  subjectCode: string
  subjectName: string
  teacherId: string
  teacherName: string
  title: string
  instructions: string | null
  dueDate: string
  status: AssignmentStatus
  isOverdue: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AssignmentDetail = AssignmentListItem

export interface AssignmentListResult {
  items: AssignmentListItem[]
  total: number
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface AssignmentSubjectOption {
  id: string
  code: string
  name: string
}

export interface AssignmentClassSectionOption {
  id: string
  name: string
}

export interface AssignmentClassOption {
  id: string
  name: string
  sections: AssignmentClassSectionOption[]
}

export interface AssignmentContext {
  teacherId: string | null
  teacherName: string | null
  subjects: AssignmentSubjectOption[]
  classes: AssignmentClassOption[]
}