import { describe, expect, it } from "vitest"
import { validateSectionForm } from "./sectionFormRules"

describe("validateSectionForm (frontend, DOM-free)", () => {
  it("accepts a valid section", () => {
    expect(validateSectionForm({ classId: "class-1", name: "A" })).toEqual([])
  })

  it("flags a missing class", () => {
    expect(validateSectionForm({ classId: "", name: "A" })).toEqual([
      { field: "classId", message: "A class is required" },
    ])
  })

  it("flags a blank name", () => {
    expect(validateSectionForm({ classId: "class-1", name: "  " })).toEqual([
      { field: "name", message: "Section name is required" },
    ])
  })
})
