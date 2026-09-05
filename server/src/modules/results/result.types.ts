import type { ExamStatus } from "../exams/exam.rules.js"

export interface ResultSheetExamMeta {
  id: string
  name: string
  examTypeName: string
  academicSessionName: string
  className: string
  sectionName: string | null
  startDate: string
  endDate: string
  status: ExamStatus
  publishedAt: string | null
  finalizedAt: string | null
}

export interface ResultSheetSubject {
  id: string
  subjectId: string
  subjectCode: string
  subjectName: string
  teacherId: string
  teacherName: string
  maxMarks: string
  passMarks: string
  sortOrder: number
  canEdit: boolean
}

export interface ResultMarkCell {
  examResultId: string | null
  examSubjectId: string
  obtainedMarks: string | null
  isAbsent: boolean
  percentage: string | null
  grade: string | null
  isPass: boolean | null
}

export interface ResultSheetRow {
  enrollmentId: string
  studentId: string
  admissionNumber: string
  studentName: string
  marks: ResultMarkCell[]
  isComplete: boolean
  totalObtained: string | null
  totalMaxMarks: string | null
  totalPercentage: string | null
  grade: string | null
  isPass: boolean | null
  rank: number | null
}

export interface ResultSheetPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ResultSheet {
  exam: ResultSheetExamMeta
  subjects: ResultSheetSubject[]
  rows: ResultSheetRow[]
  pagination: ResultSheetPagination
  /** Lifecycle readiness flags (the UI additionally gates buttons by `results:publish`). */
  canFinalize: boolean
  canReopen: boolean
}

export interface MarksSaveResult {
  saved: number
}

export interface FinalizeResult {
  finalized: true
  ranked: number
}

export interface ReopenResult {
  reopened: true
}