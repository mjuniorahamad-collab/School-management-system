import type { AcademicSession } from "@prisma/client"
import type { AcademicSessionDetail } from "./academic-session.types.js"

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function toAcademicSessionDetail(session: AcademicSession): AcademicSessionDetail {
  return {
    id: session.id,
    name: session.name,
    code: session.code,
    startDate: toDateString(session.startDate),
    endDate: toDateString(session.endDate),
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}
