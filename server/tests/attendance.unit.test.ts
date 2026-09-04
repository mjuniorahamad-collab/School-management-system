import { describe, expect, it } from "vitest"
import { computeAttendancePercent } from "../src/modules/attendance/attendance.rules.js"
import {
  attendanceStatusEnum,
  bulkMarkAttendanceSchema,
  markAttendanceSchema,
} from "../src/modules/attendance/attendance.schema.js"

describe("attendanceStatusEnum", () => {
  it("accepts the four statuses", () => {
    for (const s of ["PRESENT", "ABSENT", "LATE", "HOLIDAY"]) {
      expect(attendanceStatusEnum.safeParse(s).success).toBe(true)
    }
  })

  it("rejects an unknown status", () => {
    expect(attendanceStatusEnum.safeParse("PRESENT ").success).toBe(false)
    expect(attendanceStatusEnum.safeParse("UNKNOWN").success).toBe(false)
  })
})

describe("computeAttendancePercent (database-free)", () => {
  it("returns 0 when there are no days", () => {
    expect(computeAttendancePercent(0, 0)).toBe(0)
  })

  it("computes present+late over total days", () => {
    expect(computeAttendancePercent(8, 10)).toBe(80)
  })

  it("rounds to two decimals", () => {
    expect(computeAttendancePercent(1, 3)).toBe(33.33)
  })

  it("returns 100 for full attendance", () => {
    expect(computeAttendancePercent(5, 5)).toBe(100)
  })
})

describe("markAttendanceSchema (database-free)", () => {
  const u = (n: string) => `00000000-0000-4000-8000-0000000000${n}`
  const valid = {
    academicSessionId: u("01"),
    classId: u("02"),
    sectionId: u("03"),
    date: "2026-05-01",
    studentId: u("04"),
    status: "PRESENT",
  }

  it("accepts a valid mark with a section", () => {
    expect(markAttendanceSchema.safeParse(valid).success).toBe(true)
  })

  it("accepts a sectionless mark", () => {
    expect(markAttendanceSchema.safeParse({ ...valid, sectionId: null }).success).toBe(true)
    const withoutSection = {
      academicSessionId: valid.academicSessionId,
      classId: valid.classId,
      date: valid.date,
      studentId: valid.studentId,
      status: valid.status,
    }
    expect(markAttendanceSchema.safeParse(withoutSection).success).toBe(true)
  })

  it("rejects a malformed date", () => {
    expect(markAttendanceSchema.safeParse({ ...valid, date: "05/01/2026" }).success).toBe(false)
  })

  it("rejects an invalid status", () => {
    expect(markAttendanceSchema.safeParse({ ...valid, status: "UNKNOWN" }).success).toBe(false)
  })

  it("rejects an over-long note", () => {
    expect(
      markAttendanceSchema.safeParse({ ...valid, note: "x".repeat(501) }).success,
    ).toBe(false)
  })
})

describe("bulkMarkAttendanceSchema (database-free)", () => {
  const u = (n: string) => `00000000-0000-4000-8000-0000000000${n}`
  const valid = {
    academicSessionId: u("01"),
    classId: u("02"),
    sectionId: null,
    date: "2026-05-01",
    records: [
      { studentId: u("04"), status: "PRESENT" },
      { studentId: u("05"), status: "ABSENT", note: "sick" },
    ],
  }

  it("accepts a valid bulk payload", () => {
    expect(bulkMarkAttendanceSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects an empty records array", () => {
    expect(bulkMarkAttendanceSchema.safeParse({ ...valid, records: [] }).success).toBe(false)
  })

  it("rejects unknown record fields (strict)", () => {
    expect(
      bulkMarkAttendanceSchema.safeParse({
        ...valid,
        records: [{ studentId: valid.records[0].studentId, status: "PRESENT", extra: 1 }],
      }).success,
    ).toBe(false)
  })
})
