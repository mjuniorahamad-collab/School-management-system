import { describe, expect, it } from "vitest"
import { buildStaffNumber } from "../src/modules/staff/staff-number.js"
import { createStaffSchema, updateStaffSchema, listStaffsQuerySchema } from "../src/modules/staff/staff.schema.js"

describe("buildStaffNumber (database-free)", () => {
  it("formats a zero-padded employee id with the year", () => {
    expect(buildStaffNumber(2026, 1)).toBe("STF-2026-0001")
    expect(buildStaffNumber(2026, 42)).toBe("STF-2026-0042")
    expect(buildStaffNumber(2026, 9999)).toBe("STF-2026-9999")
  })

  it("rejects an invalid sequence", () => {
    expect(() => buildStaffNumber(2026, 0)).toThrow()
    expect(() => buildStaffNumber(2026, 1.5)).toThrow()
  })
})

describe("staff schemas (database-free)", () => {
  it("accepts a valid staff member with required fields", () => {
    const parsed = createStaffSchema.parse({
      firstName: "Grace",
      gender: "FEMALE",
      department: "Administration",
      designation: "Office Manager",
      joiningDate: "2026-02-01",
    })
    expect(parsed.firstName).toBe("Grace")
    expect(parsed.department).toBe("Administration")
  })

  it("accepts optional emergency contact fields", () => {
    const parsed = createStaffSchema.parse({
      firstName: "Grace",
      gender: "FEMALE",
      department: "Administration",
      designation: "Office Manager",
      joiningDate: "2026-02-01",
      emergencyContactName: "John",
      emergencyContactRelationship: "Spouse",
      emergencyContactPhone: "555-0100",
    })
    expect(parsed.emergencyContactPhone).toBe("555-0100")
  })

  it("rejects a blank first name, department or designation", () => {
    expect(createStaffSchema.safeParse({ firstName: "", gender: "MALE", department: "Admin", designation: "Mgr", joiningDate: "2026-02-01" }).success).toBe(false)
    expect(createStaffSchema.safeParse({ firstName: "A", gender: "MALE", department: " ", designation: "Mgr", joiningDate: "2026-02-01" }).success).toBe(false)
    expect(createStaffSchema.safeParse({ firstName: "A", gender: "MALE", department: "Admin", designation: " ", joiningDate: "2026-02-01" }).success).toBe(false)
  })

  it("rejects an invalid joining date format", () => {
    expect(createStaffSchema.safeParse({ firstName: "A", gender: "MALE", department: "Admin", designation: "Mgr", joiningDate: "not-a-date" }).success).toBe(false)
  })

  it("rejects unknown fields on create (strict schema)", () => {
    expect(createStaffSchema.safeParse({ firstName: "A", gender: "MALE", department: "Admin", designation: "Mgr", joiningDate: "2026-02-01", extra: true }).success).toBe(false)
  })

  it("update schema is partial and rejects unknown fields", () => {
    expect(updateStaffSchema.safeParse({ phone: "123" }).success).toBe(true)
    expect(updateStaffSchema.safeParse({ firstName: "A", unknown: 1 }).success).toBe(false)
  })
})

describe("staff list query schema (database-free)", () => {
  it("defaults page and pageSize", () => {
    const parsed = listStaffsQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
  })

  it("accepts search, status and department filters", () => {
    const parsed = listStaffsQuerySchema.parse({ search: "grace", status: "ACTIVE", department: "Admin", page: "2", pageSize: "50" })
    expect(parsed.search).toBe("grace")
    expect(parsed.department).toBe("Admin")
    expect(parsed.page).toBe(2)
    expect(parsed.pageSize).toBe(50)
  })

  it("rejects an invalid department-only? it validates status", () => {
    expect(listStaffsQuerySchema.safeParse({ status: "BOGUS" }).success).toBe(false)
  })
})
