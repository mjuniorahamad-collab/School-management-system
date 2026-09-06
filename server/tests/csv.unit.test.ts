import { describe, expect, it } from "vitest"
import { rowsToCsv } from "../src/lib/csv.js"

describe("rowsToCsv (shared export utility)", () => {
  it("prefixes a UTF-8 BOM and separates rows with CRLF", () => {
    const csv = rowsToCsv(["A", "B"], [["1", "x"]])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain("\r\n")
    expect(csv).not.toContain("\n\uFEFF")
  })

  it("writes the header row first", () => {
    const csv = rowsToCsv(["Admission No.", "Name"], [])
    const [header] = csv.slice(1).split("\r\n", 1)
    expect(header).toBe('"Admission No.","Name"')
  })

  it("quotes every cell and doubles inner quotes", () => {
    const csv = rowsToCsv(["name"], [[`Ravi "R.K." Kumar`]])
    expect(csv.slice(1)).toContain('"Ravi ""R.K."" Kumar"')
  })

  it("renders empty cells as empty quotes", () => {
    const csv = rowsToCsv(["a", "b"], [["", null]])
    expect(csv.slice(1)).toContain('"",""')
  })

  it("coerces numbers and booleans to strings", () => {
    const csv = rowsToCsv(["n", "flag"], [[42, true]])
    expect(csv.slice(1)).toContain('"42","true"')
  })

  it("terminates the last data row with a CRLF", () => {
    const csv = rowsToCsv(["a"], [["1"]])
    expect(csv.endsWith("\r\n")).toBe(true)
  })
})