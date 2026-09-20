import { describe, expect, it } from "vitest"
import { buildAdmissionNumber } from "../src/modules/students/admission-number.js"
import { normalizeGuardianPrimaries } from "../src/modules/students/student-rules.js"
import { listStudentsQuerySchema } from "../src/modules/students/student.schema.js"
import { studentListToCsv } from "../src/modules/students/student.service.js"
import type { StudentListItem } from "../src/modules/students/student.types.js"

describe("buildAdmissionNumber (database-free)", () => {
  it("formats the sequence zero-padded within the school year", () => {
    expect(buildAdmissionNumber(2026, 1)).toBe("ADM-2026-0001")
    expect(buildAdmissionNumber(2026, 42)).toBe("ADM-2026-0042")
    expect(buildAdmissionNumber(2027, 9999)).toBe("ADM-2027-9999")
    expect(buildAdmissionNumber(2028, 10000)).toBe("ADM-2028-10000")
  })

  it("rejects invalid sequences", () => {
    expect(() => buildAdmissionNumber(2026, 0)).toThrow()
    expect(() => buildAdmissionNumber(2026, -3)).toThrow()
    expect(() => buildAdmissionNumber(2026, Number.NaN)).toThrow()
  })
})

describe("normalizeGuardianPrimaries (database-free)", () => {
  it("marks the first guardian as primary when none is flagged", () => {
    const input = [
      { name: "Ravi Kumar", relationshipType: "PARENT" as const },
      { name: "Sunita Kumar", relationshipType: "MOTHER" as const },
    ]
    const result = normalizeGuardianPrimaries(input)
    expect(result[0].isPrimary).toBe(true)
    expect(result[1].isPrimary).toBe(false)
  })

  it("keeps an explicitly flagged primary untouched", () => {
    const input = [
      { name: "A", relationshipType: "FATHER" as const },
      { name: "B", relationshipType: "MOTHER" as const, isPrimary: true },
    ]
    const result = normalizeGuardianPrimaries(input)
    expect(result[0].isPrimary).toBeFalsy()
    expect(result[1].isPrimary).toBe(true)
  })

  it("rejects more than one primary guardian", () => {
    const input = [
      { name: "A", relationshipType: "PARENT" as const, isPrimary: true },
      { name: "B", relationshipType: "MOTHER" as const, isPrimary: true },
    ]
    expect(() => normalizeGuardianPrimaries(input)).toThrow("Only one guardian")
  })

  it("returns an empty list unchanged", () => {
    expect(normalizeGuardianPrimaries([])).toEqual([])
  })
})

describe("listStudentsQuerySchema (database-free)", () => {
  it("applies defaults for an empty query", () => {
    const result = listStudentsQuerySchema.parse({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    expect(result.sortBy).toBe("name")
    expect(result.sortDir).toBe("asc")
    expect(result.search).toBeUndefined()
    expect(result.status).toBeUndefined()
  })

  it("treats empty query values as absent", () => {
    const result = listStudentsQuerySchema.parse({ search: "", status: "" })
    expect(result.search).toBeUndefined()
    expect(result.status).toBeUndefined()
  })

  it("coerces numeric string parameters", () => {
    const result = listStudentsQuerySchema.parse({ page: "3", pageSize: "50" })
    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(50)
  })

  it("rejects malformed values", () => {
    expect(listStudentsQuerySchema.safeParse({ page: "abc" }).success).toBe(false)
    expect(listStudentsQuerySchema.safeParse({ pageSize: 0 }).success).toBe(false)
    expect(listStudentsQuerySchema.safeParse({ sortBy: "createdAt" }).success).toBe(false)
  })

  it("accepts the maximum allowed pageSize of 100", () => {
    const result = listStudentsQuerySchema.safeParse({ pageSize: "100" })
    expect(result.success).toBe(true)
    expect(result.success && result.data.pageSize).toBe(100)
  })

  it("rejects a pageSize above the maximum (e.g. 1000)", () => {
    expect(listStudentsQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false)
    expect(listStudentsQuerySchema.safeParse({ pageSize: 1000 }).success).toBe(false)
  })

  it("keeps optional academic filters when non-empty", () => {
    const result = listStudentsQuerySchema.parse({
      sessionId: "sess-1",
      classId: "class-1",
      sectionId: "section-A",
      status: "ACTIVE",
    })
    expect(result.sessionId).toBe("sess-1")
    expect(result.classId).toBe("class-1")
    expect(result.sectionId).toBe("section-A")
    expect(result.status).toBe("ACTIVE")
  })
})

function sampleStudent(overrides: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id: "student-1",
    admissionNumber: "ADM-2026-0001",
    firstName: "Aditya",
    middleName: null,
    lastName: "Singh",
    name: "Aditya Singh",
    gender: "MALE",
    status: "ACTIVE",
    photoUrl: null,
    class: { id: "class-1", name: "6" },
    section: { id: "section-1", name: "A" },
    primaryGuardian: { id: "guardian-1", name: 'Ravi "R.K." Kumar', phone: "12345" },
    admissionDate: "2026-08-30T00:00:00.000Z",
    dateOfBirth: "2015-05-01T00:00:00.000Z",
    email: "aditya@example.com",
    phone: "9876543210",
    city: "Austin",
    state: "TX",
    ...overrides,
  }
}

describe("studentListToCsv (database-free)", () => {
  it("prefixes a UTF-8 BOM and writes a header row", () => {
    const csv = studentListToCsv([sampleStudent()])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    const [header] = csv.slice(1).split("\r\n", 1)
    expect(header).toContain("Admission No.")
    expect(header).toContain("Class")
  })

  it("escapes quotes in cell values", () => {
    const csv = studentListToCsv([sampleStudent()])
    expect(csv).toContain('"Ravi ""R.K."" Kumar"')
  })

  it("writes one row per student with the placement values", () => {
    const csv = studentListToCsv([sampleStudent()])
    const row = csv.slice(1).split("\r\n")[1]
    expect(row).toContain('"ADM-2026-0001"')
    expect(row).toContain('"6"')
    expect(row).toContain('"A"')
    expect(row).toContain('"ACTIVE"')
  })

  it("keeps class/section cells empty when a student is unplaced", () => {
    const csv = studentListToCsv([sampleStudent({ class: null, section: null })])
    const row = csv.slice(1).split("\r\n")[1]
    const cells = row.split(",")
    expect(cells[2]).toBe('""')
    expect(cells[3]).toBe('""')
  })
})