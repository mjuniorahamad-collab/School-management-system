import type { ExamMark } from "@prisma/client"
import { examDate } from "../exams/exam.mapper.js"
import type { ExamSubjectWithIncludes } from "../exams/exam.mapper.js"
import type {
  ResultMarkCell,
  ResultSheetExamMeta,
  ResultSheetSubject,
} from "./result.types.js"

type ResultSheetExamRow = {
  id: string
  name: string
  status: import("../exams/exam.rules.js").ExamStatus
  publishedAt: Date | null
  finalizedAt: Date | null
  startDate: Date
  endDate: Date
  academicSession: { name: string }
  examType: { name: string }
  class: { name: string }
  section: { name: string } | null
}

export function toResultSheetExamMeta(row: ResultSheetExamRow): ResultSheetExamMeta {
  return {
    id: row.id,
    name: row.name,
    examTypeName: row.examType.name,
    academicSessionName: row.academicSession.name,
    className: row.class.name,
    sectionName: row.section?.name ?? null,
    startDate: examDate(row.startDate),
    endDate: examDate(row.endDate),
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
  }
}

export function toResultSheetSubject(
  item: ExamSubjectWithIncludes,
  canEdit: boolean,
): ResultSheetSubject {
  return {
    id: item.id,
    subjectId: item.subjectId,
    subjectCode: item.subject.code,
    subjectName: item.subject.name,
    teacherId: item.teacherId,
    teacherName: [item.teacher.firstName, item.teacher.lastName]
      .filter(Boolean)
      .join(" "),
    maxMarks: item.maxMarks.toString(),
    passMarks: item.passMarks.toString(),
    sortOrder: item.sortOrder,
    canEdit,
  }
}

export function toResultMarkCell(
  mark: ExamMark | null,
  examSubjectId: string,
): ResultMarkCell {
  return {
    examResultId: mark?.examResultId ?? null,
    examSubjectId,
    obtainedMarks: mark?.obtainedMarks?.toString() ?? null,
    isAbsent: mark?.isAbsent ?? false,
    percentage: mark?.percentage?.toString() ?? null,
    grade: mark?.grade ?? null,
    isPass: mark?.isPass ?? null,
  }
}