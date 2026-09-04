import { describe, expect, it } from "vitest"
import { normalizeSubjectCode, subjectFormToPayload, validateSubjectForm } from "./subjectFormRules"

describe("normalizeSubjectCode (frontend, DOM-free)", () => {
  it("trims, collapses whitespace, and uppercases", () => {
    expect(normalizeSubjectCode("  computer   science  ")).toBe("COMPUTER SCIENCE")
  })
})

describe("validateSubjectForm (frontend, DOM-free)", () => {
  it("accepts a valid subject", () => {
    expect(validateSubjectForm({ code: "MAT", name: "Mathematics", sortOrder: "1" })).toEqual([])
  })

  it("flags a blank code and name", () => {
    expect(validateSubjectForm({ code: "  ", name: "", sortOrder: "" })).toEqual(
      expect.arrayContaining([
        { field: "code", message: "Subject code is required" },
        { field: "name", message: "Subject name is required" },
      ]),
    )
  })
})

describe("subjectFormToPayload (frontend, DOM-free)", () => {
  it("normalizes the code and trims the name", () => {
    expect(subjectFormToPayload({ code: "  mat ", name: " Mathematics ", sortOrder: "" })).toEqual({
      code: "MAT",
      name: "Mathematics",
    })
  })

  it("includes a valid integer sort order", () => {
    expect(subjectFormToPayload({ code: "MAT", name: "Mathematics", sortOrder: "2" })).toEqual({
      code: "MAT",
      name: "Mathematics",
      sortOrder: 2,
    })
  })

  it("drops non-integer or negative sort orders", () => {
    expect(subjectFormToPayload({ code: "MAT", name: "Mathematics", sortOrder: "2.5" })).toEqual({
      code: "MAT",
      name: "Mathematics",
    })
  })
})
