import { describe, expect, it } from "vitest"
import {
  concessionRequestFormToPayload,
  isValidMoney,
  validateConcessionRequestForm,
} from "./concessionFormRules"

describe("isValidMoney (frontend, DOM-free)", () => {
  it("accepts positive amounts with two decimals", () => {
    expect(isValidMoney(5000)).toBe(true)
    expect(isValidMoney(1234.5)).toBe(true)
    expect(isValidMoney(0.99)).toBe(true)
  })
  it("rejects zero, negatives, and over-precise values", () => {
    expect(isValidMoney(0)).toBe(false)
    expect(isValidMoney(-5)).toBe(false)
    expect(isValidMoney(1.234)).toBe(false)
    expect(isValidMoney(Number.NaN)).toBe(false)
  })
})

describe("validateConcessionRequestForm", () => {
  const base = { invoiceId: "inv-1", kind: "FIXED_AMOUNT" as const, value: "5000", reason: "" }

  it("accepts a valid fixed-amount concession", () => {
    expect(validateConcessionRequestForm(base)).toEqual([])
  })
  it("accepts a valid percentage concession at or below 100", () => {
    expect(validateConcessionRequestForm({ ...base, kind: "PERCENTAGE", value: "100" })).toEqual([])
  })
  it("rejects a missing invoice", () => {
    expect(validateConcessionRequestForm({ ...base, invoiceId: "" })).toEqual(
      expect.arrayContaining([{ field: "invoiceId", message: "An invoice is required" }]),
    )
  })
  it("rejects a blank or invalid value", () => {
    const blank = validateConcessionRequestForm({ ...base, value: "" })
    expect(blank).toEqual(
      expect.arrayContaining([
        { field: "value", message: "Enter a positive amount with at most two decimal places" },
      ]),
    )
    const tooPrecise = validateConcessionRequestForm({ ...base, value: "12.345" })
    expect(tooPrecise).toEqual(
      expect.arrayContaining([
        { field: "value", message: "Enter a positive amount with at most two decimal places" },
      ]),
    )
  })
  it("rejects a percentage above 100", () => {
    expect(validateConcessionRequestForm({ ...base, kind: "PERCENTAGE", value: "101" })).toEqual(
      expect.arrayContaining([
        { field: "value", message: "A percentage concession cannot exceed 100" },
      ]),
    )
  })
  it("accepts an oversized fixed amount (percent rule does not apply)", () => {
    expect(validateConcessionRequestForm({ ...base, kind: "FIXED_AMOUNT", value: "100000" })).toEqual([])
  })
  it("rejects an over-long reason", () => {
    expect(validateConcessionRequestForm({ ...base, reason: "x".repeat(501) })).toEqual(
      expect.arrayContaining([{ field: "reason", message: "Reason must be at most 500 characters" }]),
    )
  })
})

describe("concessionRequestFormToPayload", () => {
  it("sends only the fields the API accepts", () => {
    expect(
      concessionRequestFormToPayload({
        invoiceId: "inv-9",
        kind: "PERCENTAGE",
        value: "15",
        reason: "  Hardship   ",
      }),
    ).toEqual({ invoiceId: "inv-9", kind: "PERCENTAGE", value: 15, reason: "Hardship" })
  })
  it("omits an empty reason", () => {
    expect(
      concessionRequestFormToPayload({ invoiceId: "inv-9", kind: "FIXED_AMOUNT", value: "2500", reason: " " }),
    ).toEqual({ invoiceId: "inv-9", kind: "FIXED_AMOUNT", value: 2500 })
  })
})