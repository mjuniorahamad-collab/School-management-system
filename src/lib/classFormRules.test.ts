import { describe, expect, it } from "vitest"
import { classFormToPayload, validateClassForm } from "./classFormRules"

describe("validateClassForm (frontend, DOM-free)", () => {
  it("accepts a valid class", () => {
    expect(validateClassForm({ name: "6", sortOrder: "2" })).toEqual([])
  })

  it("flags a blank name", () => {
    expect(validateClassForm({ name: "  ", sortOrder: "" })).toEqual([
      { field: "name", message: "Class name is required" },
    ])
  })
})

describe("classFormToPayload (frontend, DOM-free)", () => {
  it("trims the name and omits an empty sort order", () => {
    expect(classFormToPayload({ name: "  6 ", sortOrder: "" })).toEqual({ name: "6" })
  })

  it("includes a valid integer sort order", () => {
    expect(classFormToPayload({ name: "6", sortOrder: "3" })).toEqual({ name: "6", sortOrder: 3 })
  })

  it("drops non-integer or negative sort orders", () => {
    expect(classFormToPayload({ name: "6", sortOrder: "1.5" })).toEqual({ name: "6" })
    expect(classFormToPayload({ name: "6", sortOrder: "-1" })).toEqual({ name: "6" })
  })
})
