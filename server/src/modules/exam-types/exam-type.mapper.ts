import type { ExamType } from "@prisma/client"
import type { ExamTypeDetail, ExamTypeListItem } from "./exam-type.types.js"

export function toExamTypeListItem(examType: ExamType): ExamTypeListItem {
  return {
    id: examType.id,
    code: examType.code,
    name: examType.name,
    sortOrder: examType.sortOrder,
    createdAt: examType.createdAt.toISOString(),
    updatedAt: examType.updatedAt.toISOString(),
  }
}

export function toExamTypeDetail(examType: ExamType): ExamTypeDetail {
  return toExamTypeListItem(examType)
}
