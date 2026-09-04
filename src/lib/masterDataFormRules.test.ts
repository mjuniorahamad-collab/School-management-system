import { describe, expect, it } from "vitest"
import {
  feeHeadFormToPayload,
  gradingBandFormToPayload,
  normalizeCode,
  periodSlotFormToPayload,
  validateFeeHeadForm,
  validateGradingBandForm,
  validatePeriodSlotForm,
} from "./masterDataFormRules"

describe("normalizeCode (frontend, DOM-free)", () => {
  it("trims, collapses whitespace, and uppercases", () => {
    expect(normalizeCode("  tuition   fee  ")).toBe("TUITION FEE")
  })
})

describe("validateFeeHeadForm", () => {
  it("accepts a valid fee head", () => {
    expect(validateFeeHeadForm({ code: "TU", name: "Tuition", isRecurring: true })).toEqual([])
  })
  it("flags blank code and name", () => {
    expect(validateFeeHeadForm({ code: " ", name: "", isRecurring: false })).toEqual(
      expect.arrayContaining([
        { field: "code", message: "Fee head code is required" },
        { field: "name", message: "Fee head name is required" },
      ]),
    )
  })
})

describe("feeHeadFormToPayload", () => {
  it("normalizes the code and trims the name", () => {
    expect(
      feeHeadFormToPayload({ code: "  tu ", name: " Tuition ", isRecurring: true }),
    ).toEqual({ code: "TU", name: "Tuition", isRecurring: true })
  })
})

describe("validatePeriodSlotForm", () => {
  it("accepts a valid period slot", () => {
    expect(
      validatePeriodSlotForm({ name: "P1", startTime: "08:00", endTime: "08:45", sortOrder: "" }),
    ).toEqual([])
  })
  it("rejects invalid or inverted times", () => {
    const bad = validatePeriodSlotForm({
      name: "P1",
      startTime: "10:00",
      endTime: "09:00",
      sortOrder: "",
    })
    expect(bad).toEqual(
      expect.arrayContaining([{ field: "endTime", message: "End time must be after start time" }]),
    )
    const malformed = validatePeriodSlotForm({
      name: "P1",
      startTime: "25:00",
      endTime: "08:45",
      sortOrder: "",
    })
    expect(malformed).toEqual(
      expect.arrayContaining([{ field: "startTime", message: "Start time must be a valid HH:MM time" }]),
    )
  })
})

describe("periodSlotFormToPayload", () => {
  it("maps fields and drops non-integer sort order", () => {
    expect(
      periodSlotFormToPayload({ name: " P1 ", startTime: "08:00", endTime: "08:45", sortOrder: "2.5" }),
    ).toEqual({ name: "P1", startTime: "08:00", endTime: "08:45" })
  })
})

describe("validateGradingBandForm", () => {
  it("accepts a valid band", () => {
    expect(
      validateGradingBandForm({ minPercent: "90", maxPercent: "100", grade: "A", description: "", sortOrder: "" }),
    ).toEqual([])
  })
  it("rejects an inverted range and missing values", () => {
    const inverted = validateGradingBandForm({
      minPercent: "90",
      maxPercent: "50",
      grade: "A",
      description: "",
      sortOrder: "",
    })
    expect(inverted).toEqual(
      expect.arrayContaining([{ field: "maxPercent", message: "Maximum must be ≥ minimum" }]),
    )
  })
})

describe("gradingBandFormToPayload", () => {
  it("maps numeric fields and optional description", () => {
    expect(
      gradingBandFormToPayload({
        minPercent: "90",
        maxPercent: "100",
        grade: "A",
        description: "Excellent",
        sortOrder: "1",
      }),
    ).toEqual({ minPercent: 90, maxPercent: 100, grade: "A", description: "Excellent", sortOrder: 1 })
  })
})
