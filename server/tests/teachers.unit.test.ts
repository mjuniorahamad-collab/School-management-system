import { describe, expect, it } from "vitest"
import { buildTeacherNumber } from "../src/modules/teachers/teacher-number.js"
import { createTeacherSchema, updateTeacherSchema, listTeachersQuerySchema } from "../src/modules/teachers/teacher.schema.js"

describe("buildTeacherNumber (database-free)", () => {
  it("formats a zero-padded employee id with the year", () => {
    expect(buildTeacherNumber(2026, 1)).toBe("TCH-2026-0001")
    expect(buildTeacherNumber(2026, 42)).toBe("TCH-2026-0042")
    expect(buildTeacherNumber(2026, 1234)).toBe("TCH-2026-1234")
  })

  it("rejects an invalid sequence", () => {
    expect(() => buildTeacherNumber(2026, 0)).toThrow()
    expect(() => buildTeacherNumber(2026, 1.5)).toThrow()
  })
})

describe("teacher schemas (database-free)", () => {
  it("accepts a valid teacher with required fields", () => {
    const parsed = createTeacherSchema.parse({
      firstName: "Ada",
      gender: "FEMALE",
      designation: "Mathematics Teacher",
      joiningDate: "2026-01-15",
    })
    expect(parsed.firstName).toBe("Ada")
    expect(parsed.designation).toBe("Mathematics Teacher")
  })

  it("accepts optional subject and class assignments", () => {
    const parsed = createTeacherSchema.parse({
      firstName: "Alan",
      gender: "MALE",
      designation: "CS Teacher",
      joiningDate: "2026-01-15",
      subjectIds: ["sub_1"],
      classAssignments: [{ classId: "cls_1", sectionId: "sec_1" }],
    })
    expect(parsed.subjectIds).toEqual(["sub_1"])
    expect(parsed.classAssignments?.[0].classId).toBe("cls_1")
  })

  it("rejects a blank first name or designation", () => {
    expect(createTeacherSchema.safeParse({ firstName: "", gender: "MALE", designation: "Teacher", joiningDate: "2026-01-15" }).success).toBe(false)
    expect(createTeacherSchema.safeParse({ firstName: "A", gender: "MALE", designation: " ", joiningDate: "2026-01-15" }).success).toBe(false)
  })

  it("rejects an invalid joining date format", () => {
    expect(createTeacherSchema.safeParse({ firstName: "A", gender: "MALE", designation: "Teacher", joiningDate: "15/01/2026" }).success).toBe(false)
  })

  it("rejects an invalid gender enum", () => {
    expect(createTeacherSchema.safeParse({ firstName: "A", gender: "UNKNOWN", designation: "Teacher", joiningDate: "2026-01-15" }).success).toBe(false)
  })

  it("rejects unknown fields on create (strict schema)", () => {
    expect(createTeacherSchema.safeParse({ firstName: "A", gender: "MALE", designation: "Teacher", joiningDate: "2026-01-15", extra: true }).success).toBe(false)
  })

  it("update schema is partial and rejects unknown fields", () => {
    expect(updateTeacherSchema.safeParse({ phone: "123" }).success).toBe(true)
    expect(updateTeacherSchema.safeParse({ firstName: "A", unknown: 1 }).success).toBe(false)
  })
})

describe("teacher list query schema (database-free)", () => {
  it("defaults page and pageSize", () => {
    const parsed = listTeachersQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
  })

  it("accepts search, status and gender filters and coerce numbers", () => {
    const parsed = listTeachersQuerySchema.parse({ search: "ada", status: "ACTIVE", gender: "FEMALE", page: "3", pageSize: "10" })
    expect(parsed.search).toBe("ada")
    expect(parsed.status).toBe("ACTIVE")
    expect(parsed.page).toBe(3)
    expect(parsed.pageSize).toBe(10)
  })

  it("rejects an invalid status value", () => {
    expect(listTeachersQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false)
  })
})
