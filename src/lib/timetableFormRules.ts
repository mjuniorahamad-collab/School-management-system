import type {
  TimetableDay,
  TimetableEntryCopyDayPayload,
  TimetableEntryFormPayload,
  TimetableEntryListItem,
} from "@/types/timetable"

export interface TimetableFormValue {
  academicSessionId: string
  dayOfWeek: TimetableDay
  periodSlotId: string
  classId: string
  sectionId: string | null
  subjectId: string
  teacherId: string
}

export interface TimetableFormError {
  field: keyof TimetableFormValue
  message: string
}

export function validateTimetableForm(value: TimetableFormValue): TimetableFormError[] {
  const errors: TimetableFormError[] = []
  if (!value.academicSessionId) errors.push({ field: "academicSessionId", message: "Academic session is required" })
  if (!value.dayOfWeek) errors.push({ field: "dayOfWeek", message: "Day is required" })
  if (!value.periodSlotId) errors.push({ field: "periodSlotId", message: "Period is required" })
  if (!value.classId) errors.push({ field: "classId", message: "Class is required" })
  if (!value.subjectId) errors.push({ field: "subjectId", message: "Subject is required" })
  if (!value.teacherId) errors.push({ field: "teacherId", message: "Teacher is required" })
  return errors
}

export function timetableFormToPayload(value: TimetableFormValue): TimetableEntryFormPayload {
  return {
    academicSessionId: value.academicSessionId,
    dayOfWeek: value.dayOfWeek,
    periodSlotId: value.periodSlotId,
    classId: value.classId,
    sectionId: value.sectionId,
    subjectId: value.subjectId,
    teacherId: value.teacherId,
  }
}

export function defaultTimetableForm(): TimetableFormValue {
  return {
    academicSessionId: "",
    dayOfWeek: "MONDAY",
    periodSlotId: "",
    classId: "",
    sectionId: null,
    subjectId: "",
    teacherId: "",
  }
}

export interface CopyDayFormValue {
  sourceDay: TimetableDay
  targetDay: TimetableDay
}

export function validateCopyDayForm(value: CopyDayFormValue): string | null {
  if (value.sourceDay === value.targetDay) return "Source and target days must be different"
  return null
}

export function copyDayFormToPayload(
  value: CopyDayFormValue,
  academicSessionId: string,
): TimetableEntryCopyDayPayload {
  return {
    academicSessionId,
    sourceDay: value.sourceDay,
    targetDay: value.targetDay,
  }
}

export function defaultCopyDayForm(): CopyDayFormValue {
  return {
    sourceDay: "MONDAY",
    targetDay: "TUESDAY",
  }
}

export interface StoredPeriodSlotOption {
  id: string
  name: string
  startTime: string
  endTime: string
}

/**
 * The period picker offers ACTIVE slots only. When the entry being edited still
 * points at a slot that was retired after it was created, that stored slot is
 * added back as a labelled option so the form shows the truth instead of an
 * empty period.
 *
 * The server keeps accepting the stored (retired) slot as long as the id is
 * submitted unchanged; moving the lesson to a DIFFERENT retired slot is still
 * rejected.
 */
export function resolveStoredPeriodSlot(
  activeSlots: ReadonlyArray<{ id: string }>,
  editing: Pick<TimetableEntryListItem, "periodSlotId" | "periodSlotName" | "periodSlotStartTime" | "periodSlotEndTime"> | null,
): StoredPeriodSlotOption | null {
  if (!editing) return null
  if (activeSlots.some((slot) => slot.id === editing.periodSlotId)) return null
  return {
    id: editing.periodSlotId,
    name: editing.periodSlotName,
    startTime: editing.periodSlotStartTime,
    endTime: editing.periodSlotEndTime,
  }
}
