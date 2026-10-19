// Database-free unit tests for the report-card signatory configuration and the
// shared branding projection (server/src/lib/school-settings.ts). These are the
// single authoritative resolution points for (a) the signatories frozen into a
// v2 snapshot and (b) the school identity frozen alongside them, so their
// parsing/fallback rules are locked here without touching a database.

import { describe, expect, it, vi } from "vitest"

import {
  MAX_REPORT_CARD_SIGNATORIES,
  parseReportCardSignatories,
  projectBranding,
  readBranding,
  readReportCardSignatories,
} from "../src/lib/school-settings.js"

describe("parseReportCardSignatories", () => {
  it("reports unset for absent or blank values", () => {
    expect(parseReportCardSignatories(null).status).toBe("unset")
    expect(parseReportCardSignatories(undefined).status).toBe("unset")
    expect(parseReportCardSignatories("").status).toBe("unset")
    expect(parseReportCardSignatories("   ").status).toBe("unset")
  })

  it("reports empty for an empty array", () => {
    expect(parseReportCardSignatories("[]")).toEqual({ status: "empty" })
  })

  it("reports corrupt for malformed or non-array JSON", () => {
    expect(parseReportCardSignatories("{not json")).toEqual({ status: "corrupt" })
    expect(parseReportCardSignatories("{}")).toEqual({ status: "corrupt" })
    expect(parseReportCardSignatories("5")).toEqual({ status: "corrupt" })
    expect(parseReportCardSignatories('"Principal"')).toEqual({ status: "corrupt" })
  })

  it("reports corrupt for more than the maximum number of signatories", () => {
    const tooMany = JSON.stringify(
      Array.from({ length: MAX_REPORT_CARD_SIGNATORIES + 1 }, (_, index) => ({
        role: "role",
        name: `name-${index}`,
      })),
    )
    expect(parseReportCardSignatories(tooMany)).toEqual({ status: "corrupt" })
  })

  it("reports corrupt for malformed entries and blank fields", () => {
    expect(parseReportCardSignatories("[null]")).toEqual({ status: "corrupt" })
    expect(parseReportCardSignatories('["Principal"]')).toEqual({ status: "corrupt" })
    expect(parseReportCardSignatories('[{"role":"","name":"Dr. Rao"}]')).toEqual({
      status: "corrupt",
    })
    expect(parseReportCardSignatories('[{"role":"Principal","name":"   "}]')).toEqual({
      status: "corrupt",
    })
    expect(parseReportCardSignatories('[{"role":7,"name":"Dr. Rao"}]')).toEqual({
      status: "corrupt",
    })
  })

  it("accepts a valid list and trims each field", () => {
    expect(
      parseReportCardSignatories('[{"role":" Principal ","name":" Dr. Rao "}]'),
    ).toEqual({
      status: "valid",
      signatories: [{ role: "Principal", name: "Dr. Rao" }],
    })
  })
})

describe("readReportCardSignatories", () => {
  function client(value: string | null) {
    return {
      schoolSetting: {
        findUnique: vi.fn(async () => (value === null ? null : { value })),
      },
    }
  }

  it("reads and parses the stored value", async () => {
    const result = await readReportCardSignatories(
      client('[{"role":"Principal","name":"Dr. Rao"}]') as never,
      "school-1",
    )
    expect(result).toEqual({
      status: "valid",
      signatories: [{ role: "Principal", name: "Dr. Rao" }],
    })
  })

  it("reports unset when the key was never saved", async () => {
    expect((await readReportCardSignatories(client(null) as never, "school-1")).status).toBe("unset")
  })

  it("fails the value closed as corrupt when it cannot be parsed", async () => {
    expect(
      (await readReportCardSignatories(client("not-json") as never, "school-1")).status,
    ).toBe("corrupt")
  })
})

describe("projectBranding", () => {
  it("falls back to School.name when the stored name is unset or blank", () => {
    expect(projectBranding(new Map(), "Bright Future").schoolName).toBe("Bright Future")
    expect(projectBranding(new Map([["schoolName", "   "]]), "Bright Future").schoolName).toBe(
      "Bright Future",
    )
  })

  it("prefers a trimmed stored name over the fallback", () => {
    expect(projectBranding(new Map([["schoolName", "  BFIS  "]]), "Fallback").schoolName).toBe(
      "BFIS",
    )
  })

  it("maps unset optional rows to null and preserves real values", () => {
    const projected = projectBranding(new Map([["city", "Pune"]]), "Fallback")
    expect(projected.city).toBe("Pune")
    expect(projected.country).toBeNull()
    expect(projected.tagline).toBeNull()
  })
})

describe("readBranding", () => {
  it("projects stored rows with the school-name fallback", async () => {
    const result = await readBranding(
      {
        school: { findUnique: async () => ({ name: "Bright Future" }) },
        schoolSetting: {
          findMany: async () => [
            { key: "city", value: "Pune" },
            { key: "schoolName", value: "BFIS" },
          ],
        },
      } as never,
      "school-1",
    )
    expect(result.schoolName).toBe("BFIS")
    expect(result.city).toBe("Pune")
    expect(result.country).toBeNull()
  })

  it("fails closed when the authenticated school row is missing", async () => {
    await expect(
      readBranding(
        {
          school: { findUnique: async () => null },
          schoolSetting: { findMany: async () => [] },
        } as never,
        "school-1",
      ),
    ).rejects.toThrow("Authenticated school not found")
  })
})
