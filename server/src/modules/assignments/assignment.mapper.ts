import type { Assignment } from "@prisma/client"
import { isTaskOverdue } from "../tasks/task-rules.js"
import type { AssignmentListItem } from "./assignment.types.js"

export type AssignmentWithIncludes = Assignment & {
  academicSession: { name: string }
  class: { name: string }
  section: { name: string } | null
  subject: { code: string; name: string }
  teacher: { firstName: string; lastName: string | null }
}

function teacherName(teacher: { firstName: string; lastName: string | null }): string {
  return [teacher.firstName, teacher.lastName].filter(Boolean).join(" ")
}

export function toAssignmentListItem(
  item: AssignmentWithIncludes,
  today: string,
): AssignmentListItem {
  const dueDate = item.dueDate.toISOString().slice(0, 10)
  return {
    id: item.id,
    academicSessionId: item.academicSessionId,
    academicSessionName: item.academicSession.name,
    classId: item.classId,
    className: item.class.name,
    sectionId: item.sectionId,
    sectionName: item.section?.name ?? null,
    subjectId: item.subjectId,
    subjectCode: item.subject.code,
    subjectName: item.subject.name,
    teacherId: item.teacherId,
    teacherName: teacherName(item.teacher),
    title: item.title,
    instructions: item.instructions,
    dueDate,
    status: item.status,
    isOverdue: isTaskOverdue(dueDate, today),
    publishedAt: item.publishedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}