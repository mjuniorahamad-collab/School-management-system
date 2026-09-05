// Client-side validation for the Examinations create/edit form. Mirrors the
// backend constraints in server/src/modules/exams/exam.schema.ts.

import { CREATABLE_EXAM_STATUSES } from "@/types/exams"
import type {
  ExamFormPayload,
  ExamStatus,
  ExamSubjectInput,
} from "@/types/exams"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const NUMBER_RE = /^\d+(\.\d{1,2})?$/

export interface ExamSubjectRow {
  subjectId: string
  teacherId: string
  maxMarks: string
  passMarks: string
}

export interface ExamFormValue {
  academicSessionId: string
  examTypeId: string
  name: string
  classId: string
  sectionId: string
  startDate: string
  endDate: string
  status: ExamStatus
  subjects: ExamSubjectRow[]
}

export interface ExamFormError {
  field: keyof ExamFormValue | "subjects.row"
  message: string
  /** Index of the offending subject row when `field === "subjects.row"`. */
  rowIndex?: number
}

export function defaultExamForm(): ExamFormValue {
  const today = new Date().toISOString().slice(0, 10)
  return {
    academicSessionId: "",
    examTypeId: "",
    name: "",
    classId: "",
    sectionId: "",
    startDate: today,
    endDate: today,
    status: "DRAFT",
    subjects: [],
  }
}

export function emptySubjectRow(): ExamSubjectRow {
  return { subjectId: "", teacherId: "", maxMarks: "", passMarks: "" }
}

export function validateExamForm(value: ExamFormValue): ExamFormError[] {
  const errors: ExamFormError[] = []
  if (!value.academicSessionId) errors.push({ field: "academicSessionId", message: "Academic session is required" })
  if (!value.examTypeId) errors.push({ field: "examTypeId", message: "Exam type is required" })
  if (!value.classId) errors.push({ field: "classId", message: "Class is required" })
  const name = value.name.trim()
  if (!name) errors.push({ field: "name", message: "Name is required" })
  else if (name.length > 200) errors.push({ field: "name", message: "Name must be 200 characters or fewer" })
  if (!DATE_RE.test(value.startDate.trim())) errors.push({ field: "startDate", message: "Use YYYY-MM-DD format" })
  if (!DATE_RE.test(value.endDate.trim())) errors.push({ field: "endDate", message: "Use YYYY-MM-DD format" })
  else if (value.endDate.trim() < value.startDate.trim()) {
    errors.push({ field: "endDate", message: "End date must be on or after start date" })
  }

  const seenSubjects = new Set<string>()
  value.subjects.forEach((row, index) => {
    if (!row.subjectId) {
      errors.push({ field: "subjects.row", rowIndex: index, message: `Row ${index + 1}: choose a subject` })
    } else if (seenSubjects.has(row.subjectId)) {
      errors.push({ field: "subjects.row", rowIndex: index, message: `Row ${index + 1}: subject already listed` })
    }
    seenSubjects.add(row.subjectId)
    if (!row.teacherId) {
      errors.push({ field: "subjects.row", rowIndex: index, message: `Row ${index + 1}: choose a teacher` })
    }
    if (!parseMarks(row.maxMarks)) {
      errors.push({ field: "subjects.row", rowIndex: index, message: `Row ${index + 1}: max marks must be positive` })
    } else if (parseMarks(row.maxMarks)! > 99999.99) {
      errors.push({ field: "subjects.row", rowIndex: index, message: `Row ${index + 1}: max marks too large` })
    }
    if (!parseMarks(row.passMarks)) {
      errors.push({ field: "subjects.row", rowIndex: index, message: `Row ${index + 1}: pass marks must be positive` })
    } else {
      const max = parseMarks(row.maxMarks)
      if (max !== undefined && parseMarks(row.passMarks)! > max) {
        errors.push({ field: "subjects.row", rowIndex: index, message: `Row ${index + 1}: pass marks exceed max marks` })
      }
    }
  })

  if (value.subjects.length === 0) {
    errors.push({ field: "subjects.row", message: "At least one subject is required" })
  }
  if (value.subjects.length > 30) {
    errors.push({ field: "subjects.row", message: "At most 30 subjects per exam" })
  }
  if (!CREATABLE_EXAM_STATUSES.includes(value.status)) {
    errors.push({ field: "status", message: "Choose draft or published" })
  }
  return errors
}

export function examFormToPayload(value: ExamFormValue): ExamFormPayload {
  const subjects: ExamSubjectInput[] = value.subjects.map((row) => ({
    subjectId: row.subjectId,
    teacherId: row.teacherId,
    maxMarks: parseMarks(row.maxMarks)!,
    passMarks: parseMarks(row.passMarks)!,
  }))
  return {
    academicSessionId: value.academicSessionId,
    examTypeId: value.examTypeId,
    name: value.name.trim(),
    classId: value.classId,
    sectionId: value.sectionId || null,
    startDate: value.startDate.trim(),
    endDate: value.endDate.trim(),
    status: value.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    subjects,
  }
}

/** Subject rows are only exchanged on create; the update path uses subjects: [] */
export function examMetadataToPayload(value: ExamFormValue): Partial<ExamFormPayload> {
  return {
    name: value.name.trim(),
    startDate: value.startDate.trim(),
    endDate: value.endDate.trim(),
    sectionId: value.sectionId || null,
  }
}

function parseMarks(input: string): number | undefined {
  if (!NUMBER_RE.test(input.trim())) return undefined
  const parsed = Number(input.trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}