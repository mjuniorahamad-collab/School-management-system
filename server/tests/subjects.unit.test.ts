import { describe, expect, it } from "vitest"
import { normalizeSubjectCode } from "../src/modules/subjects/subject.rules.js"
import { createSubjectSchema } from "../src/modules/subjects/subject.schema.js"

describe("normalizeSubjectCode (database-free)", () => {
  it("uppercases and trims the code", () => {
    expect(normalizeSubjectCode(" math ")).toBe("MATH")
    expect(normalizeSubjectCode("english")).toBe("ENGLISH")
  })

  it("leaves empty strings empty", () => {
    expect(normalizeSubjectCode("  ")).toBe("")
  })
})

describe("subject schemas (database-free)", () => {
  it("accepts a valid subject with code and name", () => {
    const parsed = createSubjectSchema.parse({ code: "MAT", name: "Mathematics" })
    expect(parsed.code).toBe("MAT")
    expect(parsed.name).toBe("Mathematics")
  })

  it("accepts an optional integer sort order", () => {
    const parsed = createSubjectSchema.parse({ code: "MAT", name: "Mathematics", sortOrder: 2 })
    expect(parsed.sortOrder).toBe(2)
  })

  it("rejects a blank code or name", () => {
    expect(createSubjectSchema.safeParse({ code: "  ", name: "Mathematics" }).success).toBe(false)
    expect(createSubjectSchema.safeParse({ code: "MAT", name: "  " }).success).toBe(false)
  })

  it("rejects non-integer or negative sort order", () => {
    expect(createSubjectSchema.safeParse({ code: "MAT", name: "M", sortOrder: 0.5 }).success).toBe(false)
    expect(createSubjectSchema.safeParse({ code: "MAT", name: "M", sortOrder: -2 }).success).toBe(false)
  })

  it("rejects unknown fields (strict schema)", () => {
    expect(createSubjectSchema.safeParse({ code: "MAT", name: "M", extra: true }).success).toBe(false)
  })
})
