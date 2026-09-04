import type { TaskStatus } from "../tasks/task-rules.js"

export type HomeworkStatus = TaskStatus

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
  status: HomeworkStatus
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