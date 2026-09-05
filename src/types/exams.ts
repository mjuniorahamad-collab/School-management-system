// Domain types for the Examinations module. Mirrors the backend contract
// (server/src/modules/exams/exam.types.ts and exam.schema.ts).

export type ExamStatus = "DRAFT" | "PUBLISHED" | "FINAL" | "ARCHIVED"

export const EXAM_STATUS_OPTIONS: readonly ExamStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "FINAL",
  "ARCHIVED",
]

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  FINAL: "Final",
  ARCHIVED: "Archived",
}

/** Statuses offered on the create form (ARCHIVED/FINAL are terminal-only). */
export const CREATABLE_EXAM_STATUSES: readonly ExamStatus[] = ["DRAFT", "PUBLISHED"]

export interface ExamListItem {
  id: string
  academicSessionId: string
  academicSessionName: string
  examTypeId: string
  examTypeCode: string
  examTypeName: string
  name: string
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  startDate: string
  endDate: string
  status: ExamStatus
  publishedAt: string | null
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ExamSubjectItem {
  id: string
  subjectId: string
  subjectCode: string
  subjectName: string
  teacherId: string
  teacherName: string
  maxMarks: string
  passMarks: string
  sortOrder: number
}

export interface ExamDetail extends ExamListItem {
  subjects: ExamSubjectItem[]
}

export interface ExamListResult {
  items: ExamListItem[]
  total: number
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface ExamSessionOption {
  id: string
  name: string
}

export interface ExamTypeOption {
  id: string
  code: string
  name: string
}

export interface ExamSectionOption {
  id: string
  name: string
}

export interface ExamClassOption {
  id: string
  name: string
  sections: ExamSectionOption[]
}

export interface ExamSubjectOption {
  id: string
  code: string
  name: string
}

export interface ExamTeacherOption {
  id: string
  name: string
}

export interface ExamContext {
  academicSessions: ExamSessionOption[]
  examTypes: ExamTypeOption[]
  classes: ExamClassOption[]
  subjects: ExamSubjectOption[]
  teachers: ExamTeacherOption[]
}

export interface ExamsQuery {
  search?: string
  status?: ExamStatus
  classId?: string
  examTypeId?: string
  academicSessionId?: string
  page?: number
  pageSize?: number
}

export interface ExamSubjectInput {
  subjectId: string
  teacherId: string
  maxMarks: number
  passMarks: number
}

export interface ExamFormPayload {
  academicSessionId: string
  examTypeId: string
  name: string
  classId: string
  sectionId?: string | null
  startDate: string
  endDate: string
  status?: "DRAFT" | "PUBLISHED"
  subjects: ExamSubjectInput[]
}