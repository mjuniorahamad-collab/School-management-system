// Pure, database-free planning for the timetable scale fixtures.
//
// Shared by the guarded scale-fixture script (scripts/timetable-scale-fixtures.ts)
// and the scale integration suite, so the "real school" shape is defined once.
// Producing only plain specs — no Prisma client, no I/O — keeps it trivially
// testable and impossible to misuse against a wrong database.

export const SCALE_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const

export type ScaleDay = (typeof SCALE_DAYS)[number]

export const SCALE_PERIOD_COUNT = 8
export const SCALE_CLASS_COUNT = 30
export const SCALE_SUBJECT_COUNT = 4
/** A full secondary school's weekly lesson load for one academic session. */
export const SCALE_TARGET_ENTRIES = 1000

export interface ScalePeriodSlotSpec {
  name: string
  startTime: string
  endTime: string
  sortOrder: number
}

export interface ScaleSubjectSpec {
  code: string
  name: string
}

export interface ScaleClassSpec {
  name: string
  sortOrder: number
  sectionName: string
  employeeId: string
  teacherFirstName: string
  teacherLastName: string
  subjectCode: string
  subjectName: string
}

export interface ScaleEntrySpec {
  dayOfWeek: ScaleDay
  periodIndex: number
  classIndex: number
  subjectIndex: number
  /**
   * One dedicated teacher per class. Because the entry mapping gives each class at
   * most one lesson per (day, period) cell, a class-derived teacher is unique within
   * that cell — satisfying `timetable_teacher_slot_unique` without needing 30
   * distinct teachers per period.
   */
  teacherIndex: number
}

function minutesToTime(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0")
  const minutes = String(totalMinutes % 60).padStart(2, "0")
  return `${hours}:${minutes}`
}

export function scalePeriodSlots(count = SCALE_PERIOD_COUNT): ScalePeriodSlotSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Period ${index + 1}`,
    startTime: minutesToTime(8 * 60 + index * 45),
    endTime: minutesToTime(8 * 60 + (index + 1) * 45),
    sortOrder: index + 1,
  }))
}

export function scaleSubjects(count = SCALE_SUBJECT_COUNT): ScaleSubjectSpec[] {
  const catalog: ScaleSubjectSpec[] = [
    { code: "MAT", name: "Mathematics" },
    { code: "ENG", name: "English" },
    { code: "SCI", name: "Science" },
    { code: "SOC", name: "Social Studies" },
    { code: "HIN", name: "Hindi" },
    { code: "CMP", name: "Computer Science" },
  ]
  return catalog.slice(0, count)
}

export function scaleClasses(count = SCALE_CLASS_COUNT): ScaleClassSpec[] {
  const subjects = scaleSubjects()
  return Array.from({ length: count }, (_, index) => {
    const classNumber = index + 1
    const subject = subjects[index % subjects.length]
    return {
      name: String(classNumber),
      sortOrder: classNumber,
      sectionName: "A",
      employeeId: `T-SCALE-${String(classNumber).padStart(4, "0")}`,
      teacherFirstName: "Scale",
      teacherLastName: `Teacher ${classNumber}`,
      subjectCode: subject.code,
      subjectName: subject.name,
    }
  })
}

/**
 * Builds `count` lessons over the mixed-radix grid (day, period, class). For
 * `count <= SCALE_DAYS.length * periodCount * classCount` the (day, period, class)
 * triples are unique, so no class is double-booked in a cell and every generated
 * row passes both database uniqueness constraints.
 */
export function scaleEntrySpecs(
  count = SCALE_TARGET_ENTRIES,
  periodCount = SCALE_PERIOD_COUNT,
  classCount = SCALE_CLASS_COUNT,
): ScaleEntrySpec[] {
  const days = SCALE_DAYS.length
  const cellsPerClassCycle = days * periodCount
  return Array.from({ length: count }, (_, index) => {
    const classIndex = Math.floor(index / cellsPerClassCycle) % classCount
    return {
      dayOfWeek: SCALE_DAYS[index % days],
      periodIndex: Math.floor(index / days) % periodCount,
      classIndex,
      subjectIndex: index % SCALE_SUBJECT_COUNT,
      teacherIndex: classIndex,
    }
  })
}
