import type { AcademicCalendar, CalendarDay } from "@prisma/client"
import type {
  AcademicCalendarDetail,
  CalendarDayDetail,
  CalendarDayKindValue,
  ProvenanceValue,
  WeekdayValue,
} from "./academic-calendar.types.js"

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function toAcademicCalendarDetail(row: AcademicCalendar): AcademicCalendarDetail {
  return {
    id: row.id,
    academicSessionId: row.academicSessionId,
    workingWeekdays: row.workingWeekdays as WeekdayValue[],
    provenance: row.provenance as ProvenanceValue,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    confirmedByUserId: row.confirmedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toCalendarDayDetail(row: CalendarDay): CalendarDayDetail {
  return {
    id: row.id,
    academicSessionId: row.academicSessionId,
    date: toDateOnly(row.date),
    kind: row.kind as CalendarDayKindValue,
    instructionalValue: Number(row.instructionalValue),
    label: row.label,
    note: row.note,
    source: row.source as ProvenanceValue,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    confirmedByUserId: row.confirmedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
