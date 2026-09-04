import type { Class, Section } from "@prisma/client"
import type { SectionDetail, SectionListItem } from "./section.types.js"

export interface SectionRow extends Section {
  class: Class
  _count: { enrollments: number }
}

export function toSectionListItem(row: SectionRow): SectionListItem {
  return {
    id: row.id,
    classId: row.classId,
    className: row.class.name,
    name: row.name,
    studentCount: row._count.enrollments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toSectionDetail(row: SectionRow): SectionDetail {
  return toSectionListItem(row)
}
