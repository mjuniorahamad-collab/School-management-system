import type { Class, Section } from "@prisma/client"
import type { ClassDetail, ClassListItem } from "./class.types.js"

export interface ClassRow extends Class {
  _count: { sections: number; enrollments: number }
  sections: Section[]
}

export function toClassListItem(row: ClassRow): ClassListItem {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    sectionCount: row._count.sections,
    studentCount: row._count.enrollments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toClassDetail(row: ClassRow): ClassDetail {
  return {
    ...toClassListItem(row),
    sections: row.sections.map((section) => ({ id: section.id, name: section.name })),
  }
}
