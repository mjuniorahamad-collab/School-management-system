import { TIMETABLE_DAYS } from "@/types/timetable"
import type { TimetableEntryListItem } from "@/types/timetable"
import type { PeriodSlotListItem } from "@/types/masterData"

// TEMPORARY TEST FIXTURES — not mock product data.
//
// Deterministic generators for the timetable scale suites. They build large,
// reproducible schedules (no Math.random) so the Grid, List and Print surfaces can
// be exercised at a size a real tenant reaches, without a database. Not imported by
// any product code.

export const SCALE_PERIOD_COUNT = 6
export const SCALE_CLASS_COUNT = 8
/** 6 weekdays × 6 periods × 8 classes — a realistic single-session school day load. */
export const SCALE_ENTRY_COUNT = TIMETABLE_DAYS.length * SCALE_PERIOD_COUNT * SCALE_CLASS_COUNT

const SUBJECTS = [
  { id: "subject-math", name: "Mathematics", code: "MAT" },
  { id: "subject-eng", name: "English", code: "ENG" },
  { id: "subject-sci", name: "Science", code: "SCI" },
  { id: "subject-soc", name: "Social Studies", code: "SOC" },
] as const

function minutesToTime(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0")
  const minutes = String(totalMinutes % 60).padStart(2, "0")
  return `${hours}:${minutes}`
}

export function makeScalePeriodSlots(count = SCALE_PERIOD_COUNT): PeriodSlotListItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `slot-${index + 1}`,
    name: `Period ${index + 1}`,
    startTime: minutesToTime(8 * 60 + index * 45),
    endTime: minutesToTime(8 * 60 + (index + 1) * 45),
    sortOrder: index + 1,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  }))
}

/**
 * Builds `count` entries spread across every weekday and period slot. The mapping is
 * index-driven, so the same `count` always yields the same list and a test can
 * reason about which entries share a day+period cell.
 */
export function makeScaleEntries(
  count = SCALE_ENTRY_COUNT,
  periodSlots: PeriodSlotListItem[] = makeScalePeriodSlots(),
): TimetableEntryListItem[] {
  const perPeriod = TIMETABLE_DAYS.length
  return Array.from({ length: count }, (_, index) => {
    const day = TIMETABLE_DAYS[index % perPeriod]
    const periodSlot = periodSlots[Math.floor(index / perPeriod) % periodSlots.length]
    const classNumber =
      (Math.floor(index / (perPeriod * periodSlots.length)) % SCALE_CLASS_COUNT) + 1
    const subject = SUBJECTS[(index + classNumber) % SUBJECTS.length]
    const sectionName = classNumber % 2 === 0 ? "B" : "A"

    return {
      id: `entry-${index + 1}`,
      academicSessionId: "session-1",
      dayOfWeek: day,
      periodSlotId: periodSlot.id,
      periodSlotName: periodSlot.name,
      periodSlotStartTime: periodSlot.startTime,
      periodSlotEndTime: periodSlot.endTime,
      classId: `class-${classNumber}`,
      className: String(classNumber),
      sectionId: `section-${classNumber}${sectionName.toLowerCase()}`,
      sectionName,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectCode: subject.code,
      teacherId: `teacher-${((index % 12) + 1).toString()}`,
      teacherName: `Teacher ${(index % 12) + 1}`,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    }
  })
}
