import { describe, expect, it } from "vitest"
import { createClassSchema, updateClassSchema } from "../src/modules/classes/class.schema.js"

describe("class schemas (database-free)", () => {
  it("accepts a valid class with name only", () => {
    const parsed = createClassSchema.parse({ name: "6" })
    expect(parsed.name).toBe("6")
    expect(parsed.sortOrder).toBeUndefined()
  })

  it("accepts an optional integer sort order", () => {
    const parsed = createClassSchema.parse({ name: "6", sortOrder: 3 })
    expect(parsed.sortOrder).toBe(3)
  })

  it("rejects a blank name", () => {
    expect(createClassSchema.safeParse({ name: "  " }).success).toBe(false)
  })

  it("rejects non-integer or negative sort order", () => {
    expect(createClassSchema.safeParse({ name: "6", sortOrder: 1.5 }).success).toBe(false)
    expect(createClassSchema.safeParse({ name: "6", sortOrder: -1 }).success).toBe(false)
  })

  it("rejects unknown fields (strict schema)", () => {
    expect(createClassSchema.safeParse({ name: "6", extra: true }).success).toBe(false)
  })

  it("partial update accepts a subset of fields", () => {
    const parsed = updateClassSchema.parse({ sortOrder: 9 })
    expect(parsed.sortOrder).toBe(9)
    expect(parsed.name).toBeUndefined()
  })
})
