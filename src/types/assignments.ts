// Domain types for the Assignments module. Mirrors the backend contract
// (server/src/modules/assignments/assignment.types.ts). Assignments share the
// same task lifecycle as Homework (`TaskStatus` from types/homework.ts).

import type { TaskStatus } from "@/types/homework"

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

export interface AssignmentsQuery {
  search?: string
  status?: AssignmentStatus
  classId?: string
  subjectId?: string
  page?: number
  pageSize?: number
}

export interface AssignmentFormPayload {
  academicSessionId: string
  classId: string
  sectionId?: string | null
  subjectId: string
  teacherId: string
  title: string
  instructions?: string | null
  dueDate: string
  status?: AssignmentStatus
}