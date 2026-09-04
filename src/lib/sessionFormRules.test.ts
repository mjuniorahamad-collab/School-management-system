import { describe, expect, it } from "vitest"
import {
  sessionFormToPayload,
  validateDateInput,
  validateSessionForm,
} from "./sessionFormRules"

describe("validateDateInput (frontend, DOM-free)", () => {
  it("accepts a valid ISO date", () => {
    expect(validateDateInput("2026-04-01")).toBeNull()
  })

  it("rejects a blank value", () => {
    expect(validateDateInput("")).toBe("Date is required")
  })

  it("rejects non-ISO formats", () => {
    expect(validateDateInput("04/01/2026")).toMatch(/YYYY-MM-DD/)
    expect(validateDateInput("2026-4-1")).toMatch(/YYYY-MM-DD/)
  })
})

describe("validateSessionForm (frontend, DOM-free)", () => {
  const valid = { name: "AY 2026-27", code: "AY2026-27", startDate: "2026-04-01", endDate: "2027-03-31", status: "" }

  it("returns no errors for a valid form", () => {
    expect(validateSessionForm(valid)).toEqual([])
  })

  it("flags blank name and code", () => {
    const errors = validateSessionForm({ ...valid, name: "  ", code: "" })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "name", message: "Session name is required" },
        { field: "code", message: "Session code is required" },
      ]),
    )
  })

  it("flags a reversed date range", () => {
    const errors = validateSessionForm({ ...valid, startDate: "2027-04-01", endDate: "2026-03-31" })
    expect(errors).toEqual(
      expect.arrayContaining([{ field: "endDate", message: "End date must be after the start date" }]),
    )
  })

  it("flags malformed dates", () => {
    const errors = validateSessionForm({ ...valid, startDate: "not-a-date" })
    expect(errors.some((e) => e.field === "startDate")).toBe(true)
  })
})

describe("sessionFormToPayload (frontend, DOM-free)", () => {
  it("trims name/code and omits status when unselected", () => {
    const payload = sessionFormToPayload({ name: "  AY 2026-27 ", code: " ay2026-27 ", startDate: "2026-04-01", endDate: "2027-03-31", status: "" })
    expect(payload).toEqual({ name: "AY 2026-27", code: "ay2026-27", startDate: "2026-04-01", endDate: "2027-03-31" })
  })

  it("includes the status when chosen", () => {
    const payload = sessionFormToPayload({ name: "S", code: "C", startDate: "2026-04-01", endDate: "2027-03-31", status: "ACTIVE" })
    expect(payload.status).toBe("ACTIVE")
  })
})
