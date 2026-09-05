import type { Exam, ExamSubject } from "@prisma/client"
import type { ExamListItem, ExamSubjectItem } from "./exam.types.js"

export type ExamWithIncludes = Exam & {
  academicSession: { name: string }
  examType: { code: string; name: string }
  class: { name: string }
  section: { name: string } | null
}

export type ExamSubjectWithIncludes = ExamSubject & {
  subject: { code: string; name: string }
  teacher: { firstName: string; lastName: string | null }
}

function teacherName(teacher: { firstName: string; lastName: string | null }): string {
  return [teacher.firstName, teacher.lastName].filter(Boolean).join(" ")
}

/** `@db.Date` values are stored as midnight UTC; the YYYY-MM-DD slice is exact. */
export function examDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function toExamListItem(item: ExamWithIncludes): ExamListItem {
  return {
    id: item.id,
    academicSessionId: item.academicSessionId,
    academicSessionName: item.academicSession.name,
    examTypeId: item.examTypeId,
    examTypeCode: item.examType.code,
    examTypeName: item.examType.name,
    name: item.name,
    classId: item.classId,
    className: item.class.name,
    sectionId: item.sectionId,
    sectionName: item.section?.name ?? null,
    startDate: examDate(item.startDate),
    endDate: examDate(item.endDate),
    status: item.status,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    finalizedAt: item.finalizedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

export function toExamSubjectItem(item: ExamSubjectWithIncludes): ExamSubjectItem {
  return {
    id: item.id,
    subjectId: item.subjectId,
    subjectCode: item.subject.code,
    subjectName: item.subject.name,
    teacherId: item.teacherId,
    teacherName: teacherName(item.teacher),
    maxMarks: item.maxMarks.toString(),
    passMarks: item.passMarks.toString(),
    sortOrder: item.sortOrder,
  }
}