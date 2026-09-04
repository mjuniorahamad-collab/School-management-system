import { describe, expect, it } from "vitest"
import {
  ADMISSION_APPLICATION_PREFIX,
  RECEIPT_PREFIX,
  buildAdmissionApplicationNumber,
  buildReceiptNumber,
  buildYearlyNumber,
} from "../src/lib/id-generators.js"

describe("buildYearlyNumber (database-free)", () => {
  it("formats a zero-padded, prefixed sequence", () => {
    expect(buildYearlyNumber("RCT", 2026, 1)).toBe("RCT-2026-0001")
    expect(buildYearlyNumber("RCT", 2027, 42)).toBe("RCT-2027-0042")
    expect(buildYearlyNumber("APP", 2028, 9999)).toBe("APP-2028-9999")
    expect(buildYearlyNumber("APP", 2026, 10000)).toBe("APP-2026-10000")
  })

  it("throws for invalid sequences", () => {
    expect(() => buildYearlyNumber("RCT", 2026, 0)).toThrow()
    expect(() => buildYearlyNumber("RCT", 2026, -3)).toThrow()
    expect(() => buildYearlyNumber("RCT", 2026, Number.NaN)).toThrow()
    expect(() => buildYearlyNumber("RCT", 2026, 1.5)).toThrow()
  })
})

describe("buildReceiptNumber (database-free)", () => {
  it("uses the RCT prefix", () => {
    expect(RECEIPT_PREFIX).toBe("RCT")
    expect(buildReceiptNumber(2026, 1)).toBe("RCT-2026-0001")
  })
})

describe("buildAdmissionApplicationNumber (database-free)", () => {
  it("uses the APP prefix", () => {
    expect(ADMISSION_APPLICATION_PREFIX).toBe("APP")
    expect(buildAdmissionApplicationNumber(2026, 1)).toBe("APP-2026-0001")
  })
})
