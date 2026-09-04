import { describe, expect, it } from "vitest"
import {
  copyDayFormToPayload,
  defaultCopyDayForm,
  defaultTimetableForm,
  timetableFormToPayload,
  validateCopyDayForm,
  validateTimetableForm,
} from "./timetableFormRules"

describe("validateTimetableForm (frontend, DOM-free)", () => {
  it("accepts a fully populated form", () => {
    expect(
      validateTimetableForm({
        academicSessionId: "sess-1",
        dayOfWeek: "MONDAY",
        periodSlotId: "slot-1",
        classId: "class-1",
        sectionId: null,
        subjectId: "subj-1",
        teacherId: "teacher-1",
      }),
    ).toEqual([])
  })

  it("flags every missing required field", () => {
    const errors = validateTimetableForm(defaultTimetableForm())
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "academicSessionId", message: "Academic session is required" },
        { field: "periodSlotId", message: "Period is required" },
        { field: "classId", message: "Class is required" },
        { field: "subjectId", message: "Subject is required" },
        { field: "teacherId", message: "Teacher is required" },
      ]),
    )
  })
})

describe("timetableFormToPayload (frontend, DOM-free)", () => {
  it("preserves sectionId and all lookups", () => {
    const payload = timetableFormToPayload({
      academicSessionId: "sess-1",
      dayOfWeek: "WEDNESDAY",
      periodSlotId: "slot-1",
      classId: "class-1",
      sectionId: "section-A",
      subjectId: "subj-1",
      teacherId: "teacher-1",
    })
    expect(payload).toEqual({
      academicSessionId: "sess-1",
      dayOfWeek: "WEDNESDAY",
      periodSlotId: "slot-1",
      classId: "class-1",
      sectionId: "section-A",
      subjectId: "subj-1",
      teacherId: "teacher-1",
    })
  })
})

describe("copy day form (frontend, DOM-free)", () => {
  it("rejects copying a day onto itself", () => {
    expect(validateCopyDayForm({ sourceDay: "MONDAY", targetDay: "MONDAY" })).toMatch(
      /different/,
    )
  })

  it("accepts distinct days", () => {
    expect(validateCopyDayForm({ sourceDay: "MONDAY", targetDay: "FRIDAY" })).toBeNull()
  })

  it("builds the copy payload with the academic session id", () => {
    expect(copyDayFormToPayload(defaultCopyDayForm(), "sess-1")).toEqual({
      academicSessionId: "sess-1",
      sourceDay: "MONDAY",
      targetDay: "TUESDAY",
    })
  })
})
