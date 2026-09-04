import { describe, expect, it } from "vitest"
import { conflictMessage } from "../src/modules/timetable/timetable.rules.js"
import { createTimetableEntrySchema, copyTimetableDaySchema, timetableDayEnum } from "../src/modules/timetable/timetable.schema.js"

describe("timetableDayEnum", () => {
  it("accepts the six school days", () => {
    for (const day of ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]) {
      expect(timetableDayEnum.safeParse(day).success).toBe(true)
    }
  })

  it("rejects SUNDAY and non-day values", () => {
    expect(timetableDayEnum.safeParse("SUNDAY").success).toBe(false)
    expect(timetableDayEnum.safeParse("monday").success).toBe(false)
  })
})

describe("conflictMessage", () => {
  it("describes a class conflict", () => {
    expect(conflictMessage("class")).toMatch(/class/i)
  })

  it("describes a teacher conflict", () => {
    expect(conflictMessage("teacher")).toMatch(/teacher/i)
  })
})

describe("createTimetableEntrySchema (database-free)", () => {
  const u = (n: string) => `00000000-0000-4000-8000-0000000000${n}`
  const valid = {
    academicSessionId: u("01"),
    dayOfWeek: "MONDAY",
    periodSlotId: u("02"),
    classId: u("03"),
    sectionId: u("04"),
    subjectId: u("05"),
    teacherId: u("06"),
  }

  it("accepts a valid entry with a section", () => {
    expect(createTimetableEntrySchema.safeParse(valid).success).toBe(true)
  })

  it("accepts a whole-class entry with a null/omitted section", () => {
    expect(createTimetableEntrySchema.safeParse({ ...valid, sectionId: null }).success).toBe(true)
    const withoutSection = {
      academicSessionId: valid.academicSessionId,
      dayOfWeek: valid.dayOfWeek,
      periodSlotId: valid.periodSlotId,
      classId: valid.classId,
      subjectId: valid.subjectId,
      teacherId: valid.teacherId,
    }
    expect(createTimetableEntrySchema.safeParse(withoutSection).success).toBe(true)
  })

  it("rejects a non-uuid id", () => {
    expect(
      createTimetableEntrySchema.safeParse({ ...valid, classId: "not-a-uuid" }).success,
    ).toBe(false)
  })

  it("rejects an invalid day", () => {
    expect(
      createTimetableEntrySchema.safeParse({ ...valid, dayOfWeek: "SUNDAY" }).success,
    ).toBe(false)
  })

  it("rejects unknown fields (strict schema)", () => {
    expect(createTimetableEntrySchema.safeParse({ ...valid, userId: "x" }).success).toBe(false)
  })
})

describe("copyTimetableDaySchema (database-free)", () => {
  const sessionId = "00000000-0000-4000-8000-000000000099"

  it("accepts distinct source and target days", () => {
    expect(
      copyTimetableDaySchema.safeParse({
        academicSessionId: sessionId,
        sourceDay: "MONDAY",
        targetDay: "TUESDAY",
      }).success,
    ).toBe(true)
  })

  it("accepts the same source and target day at the schema level (enforced in the service)", () => {
    // copyTimetableDaySchema has no same-day refinement; the service rejects
    // sourceDay === targetDay with a 400. Keep this as a boundary documentation.
    expect(
      copyTimetableDaySchema.safeParse({
        academicSessionId: sessionId,
        sourceDay: "MONDAY",
        targetDay: "MONDAY",
      }).success,
    ).toBe(true)
  })
})
