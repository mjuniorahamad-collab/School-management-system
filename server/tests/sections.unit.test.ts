import { describe, expect, it } from "vitest"
import { createSectionSchema } from "../src/modules/sections/section.schema.js"

describe("section schemas (database-free)", () => {
  it("accepts a valid section with classId and name", () => {
    const parsed = createSectionSchema.parse({ classId: "class-1", name: "A" })
    expect(parsed.classId).toBe("class-1")
    expect(parsed.name).toBe("A")
  })

  it("rejects a missing classId", () => {
    expect(createSectionSchema.safeParse({ name: "A" }).success).toBe(false)
  })

  it("rejects a blank section name", () => {
    expect(createSectionSchema.safeParse({ classId: "class-1", name: "  " }).success).toBe(false)
  })

  it("rejects unknown fields (strict schema)", () => {
    expect(createSectionSchema.safeParse({ classId: "class-1", name: "A", extra: true }).success).toBe(false)
  })
})
