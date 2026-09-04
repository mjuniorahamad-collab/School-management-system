import type { Subject } from "@prisma/client"
import type { SubjectDetail, SubjectListItem } from "./subject.types.js"

export function toSubjectListItem(subject: Subject): SubjectListItem {
  return {
    id: subject.id,
    code: subject.code,
    name: subject.name,
    sortOrder: subject.sortOrder,
    createdAt: subject.createdAt.toISOString(),
    updatedAt: subject.updatedAt.toISOString(),
  }
}

export function toSubjectDetail(subject: Subject): SubjectDetail {
  return toSubjectListItem(subject)
}
