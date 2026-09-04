// Domain types for the Homework module. Mirrors the backend contract
// (server/src/modules/homework/homework.types.ts). Assignments share the
// same task lifecycle, so `TaskStatus` is re-exported here (see tasks/).

export type TaskStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"

export const TASK_STATUS_OPTIONS: readonly TaskStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"]

/** Statuses a brand-new task may be created with (ARCHIVED is terminal-only). */
export const CREATABLE_TASK_STATUSES: readonly TaskStatus[] = ["DRAFT", "PUBLISHED"]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
}

export interface HomeworkListItem {
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
  status: TaskStatus
  isOverdue: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type HomeworkDetail = HomeworkListItem

export interface HomeworkListResult {
  items: HomeworkListItem[]
  total: number
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface HomeworkSubjectOption {
  id: string
  code: string
  name: string
}

export interface HomeworkClassSectionOption {
  id: string
  name: string
}

export interface HomeworkClassOption {
  id: string
  name: string
  sections: HomeworkClassSectionOption[]
}

export interface HomeworkContext {
  teacherId: string | null
  teacherName: string | null
  subjects: HomeworkSubjectOption[]
  classes: HomeworkClassOption[]
}

export interface HomeworksQuery {
  search?: string
  status?: TaskStatus
  classId?: string
  subjectId?: string
  page?: number
  pageSize?: number
}

export interface HomeworkFormPayload {
  academicSessionId: string
  classId: string
  sectionId?: string | null
  subjectId: string
  teacherId: string
  title: string
  instructions?: string | null
  dueDate: string
  status?: TaskStatus
}