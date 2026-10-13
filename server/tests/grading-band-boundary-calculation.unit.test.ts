import { describe, expect, it } from "vitest"
import { assertBandRange } from "../src/modules/grading-bands/grading-band.rules.js"
import {
  createGradingBandSchema,
  listGradingBandsQuerySchema,
  updateGradingBandSchema,
} from "../src/modules/grading-bands/grading-band.schema.js"

// Independent calculation-verification suite for grading-band boundary
// validation. These are the numeric boundaries (0/100, min<=max, integer
// percentages) that decide whether a band can be created/updated, and are the
// only pure "grading band" logic in the module (persistence is integration
// tested elsewhere).

function validBase() {
  return { minPercent: 0, maxPercent: 100, grade: "A" }
}

describe("createGradingBandSchema numeric boundaries (calculation)", () => {
  it("accepts the full 0-100 range", () => {
    expect(createGradingBandSchema.safeParse(validBase()).success).toBe(true)
  })

  it("accepts an inclusive single-point band", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), minPercent: 50, maxPercent: 50 }).success).toBe(true)
  })

  it("accepts the 0/0 corner", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), minPercent: 0, maxPercent: 0 }).success).toBe(true)
  })

  it("accepts the 100/100 corner", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), minPercent: 100, maxPercent: 100 }).success).toBe(true)
  })

  it("rejects a minimum of -1", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), minPercent: -1 }).success).toBe(false)
  })

  it("rejects a maximum of 101", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), maxPercent: 101 }).success).toBe(false)
  })

  it("rejects a fractional minimum percentage", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), minPercent: 0.5 }).success).toBe(false)
  })

  it("rejects a fractional maximum percentage", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), maxPercent: 99.5 }).success).toBe(false)
  })

  it("rejects min greater than max at the adjacent off-by-one (50 > 49)", () => {
    const result = createGradingBandSchema.safeParse({ ...validBase(), minPercent: 50, maxPercent: 49 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["maxPercent"])
    }
  })

  it("accepts an adjacent min + 1 = max band (49/50)", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), minPercent: 49, maxPercent: 50 }).success).toBe(true)
  })

  it("rejects a missing minimum percentage", () => {
    expect(createGradingBandSchema.safeParse({ maxPercent: 100, grade: "A" }).success).toBe(false)
  })

  it("rejects a missing maximum percentage", () => {
    expect(createGradingBandSchema.safeParse({ minPercent: 0, grade: "A" }).success).toBe(false)
  })

  it("rejects a negative sort order", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), sortOrder: -1 }).success).toBe(false)
  })

  it("accepts a zero sort order", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), sortOrder: 0 }).success).toBe(true)
  })

  it("rejects a fractional sort order", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), sortOrder: 1.5 }).success).toBe(false)
  })

  it("trims and accepts a 5-character grade", () => {
    const result = createGradingBandSchema.safeParse({ ...validBase(), grade: " A+ " })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.grade).toBe("A+")
  })

  it("rejects a grade longer than 5 characters", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), grade: "ABCDEF" }).success).toBe(false)
  })

  it("rejects an empty/whitespace grade", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), grade: "   " }).success).toBe(false)
  })

  it("accepts an omitted description and a 200-char description", () => {
    expect(createGradingBandSchema.safeParse(validBase()).success).toBe(true)
    expect(createGradingBandSchema.safeParse({ ...validBase(), description: "x".repeat(200) }).success).toBe(true)
  })

  it("rejects a description longer than 200 characters", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), description: "x".repeat(201) }).success).toBe(false)
  })

  it("rejects unknown keys (schema is strict)", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), extra: 1 }).success).toBe(false)
  })

  it("preserves strict precedence: a bad bound still fails even with an unknown key", () => {
    expect(createGradingBandSchema.safeParse({ ...validBase(), minPercent: 101, extra: 1 }).success).toBe(false)
  })
})

describe("updateGradingBandSchema numeric boundaries (calculation)", () => {
  it("accepts an empty partial update", () => {
    expect(updateGradingBandSchema.safeParse({}).success).toBe(true)
  })

  it("accepts both bounds in order", () => {
    expect(updateGradingBandSchema.safeParse({ minPercent: 40, maxPercent: 60 }).success).toBe(true)
  })

  it("rejects both bounds out of order", () => {
    expect(updateGradingBandSchema.safeParse({ minPercent: 90, maxPercent: 80 }).success).toBe(false)
  })

  it("accepts an equal-bound partial pair", () => {
    expect(updateGradingBandSchema.safeParse({ minPercent: 60, maxPercent: 60 }).success).toBe(true)
  })

  it("bypasses the ordering refine when only one bound is supplied", () => {
    // QUIRK (MEDIUM): the refine short-circuits when either bound is undefined,
    // so a lone minPercent (or maxPercent) is never compared against the stored
    // counterpart. A silent min > max can therefore persist via a partial update.
    expect(updateGradingBandSchema.safeParse({ minPercent: 95 }).success).toBe(true)
    expect(updateGradingBandSchema.safeParse({ maxPercent: 5 }).success).toBe(true)
  })

  it("still range-checks a lone bound", () => {
    expect(updateGradingBandSchema.safeParse({ minPercent: 101 }).success).toBe(false)
    expect(updateGradingBandSchema.safeParse({ maxPercent: -1 }).success).toBe(false)
  })

  it("still enforces integer percentages on update", () => {
    expect(updateGradingBandSchema.safeParse({ minPercent: 50.5 }).success).toBe(false)
  })

  it("rejects unknown keys (schema is strict)", () => {
    expect(updateGradingBandSchema.safeParse({ extra: 1 }).success).toBe(false)
  })
})

describe("assertBandRange (calculation)", () => {
  it("accepts a normal ascending range", () => {
    expect(() => assertBandRange(0, 100)).not.toThrow()
    expect(() => assertBandRange(50, 60)).not.toThrow()
  })

  it("accepts an equal-bound range", () => {
    expect(() => assertBandRange(60, 60)).not.toThrow()
  })

  it("rejects an inverted range (the partial-update hole)", () => {
    expect(() => assertBandRange(95, 60)).toThrow(/greater than or equal/)
  })

  it("rejects a merged range that the update schema alone would miss", () => {
    // The schema refine cannot see the persisted counterpart, so the service
    // merges the incoming bound with the stored one and calls this helper.
    const persistedMin = 40
    const persistedMax = 60
    expect(() => assertBandRange(95, persistedMax ?? persistedMin)).toThrow(/greater than or equal/)
    expect(() => assertBandRange(persistedMin, 5)).toThrow(/greater than or equal/)
  })
})

describe("listGradingBandsQuerySchema boundaries (calculation)", () => {
  it("accepts an empty query", () => {
    expect(listGradingBandsQuerySchema.safeParse({}).success).toBe(true)
  })

  it("accepts a trimmed non-empty search", () => {
    const result = listGradingBandsQuerySchema.safeParse({ search: "  grade  " })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.search).toBe("grade")
  })

  it("rejects an empty or whitespace-only search", () => {
    expect(listGradingBandsQuerySchema.safeParse({ search: "" }).success).toBe(false)
    expect(listGradingBandsQuerySchema.safeParse({ search: "   " }).success).toBe(false)
  })

  it("rejects a search longer than 100 characters", () => {
    expect(listGradingBandsQuerySchema.safeParse({ search: "x".repeat(101) }).success).toBe(false)
  })

  it("strips unknown query keys (this schema is not strict)", () => {
    const result = listGradingBandsQuerySchema.safeParse({ search: "a", page: 2 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ search: "a" })
  })
})
