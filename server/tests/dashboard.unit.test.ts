import { describe, expect, it } from "vitest"
import {
  computeClassRanking,
  selectBestExamContext,
  trendPercent,
  type ExamContextRow,
} from "../src/modules/dashboard/dashboard.rules.js"

describe("trendPercent (database-free)", () => {
  it("returns 100 when there was no prior data but current exceeds zero", () => {
    expect(trendPercent(12, 0)).toBe(100)
  })

  it("returns 0 when there is no prior or current data", () => {
    expect(trendPercent(0, 0)).toBe(0)
  })

  it("computes positive growth rounded to 1dp", () => {
    expect(trendPercent(110, 100)).toBe(10)
    expect(trendPercent(100, 30)).toBe(233.3)
  })

  it("computes negative growth", () => {
    expect(trendPercent(80, 100)).toBe(-20)
  })

  it("handles equal values as zero growth", () => {
    expect(trendPercent(50, 50)).toBe(0)
  })
})

describe("selectBestExamContext (database-free)", () => {
  const row = (overrides: Partial<ExamContextRow>): ExamContextRow => ({
    examTypeId: "exam-type-1",
    academicSessionId: "session-1",
    sessionStart: new Date("2026-04-01T00:00:00.000Z"),
    sessionName: "2026-27",
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    endDate: new Date("2026-06-05T00:00:00.000Z"),
    ...overrides,
  })

  it("returns null with no exams", () => {
    expect(selectBestExamContext([])).toBeNull()
  })

  it("returns null when the largest context has only one class", () => {
    const rows = [row({})]
    expect(selectBestExamContext(rows)).toBeNull()
  })

  it("picks the context with the most participating classes", () => {
    const rows = [
      // Context A has 3 classes, context B has 2 — A must win.
      row({ examTypeId: "A" }),
      row({ examTypeId: "A", startDate: new Date("2026-06-02T00:00:00.000Z") }),
      row({ examTypeId: "A", startDate: new Date("2026-06-03T00:00:00.000Z") }),
      row({ examTypeId: "B", academicSessionId: "session-latest", sessionName: "2027-28" }),
      row({ examTypeId: "B", academicSessionId: "session-latest", sessionName: "2027-28" }),
    ]
    const context = selectBestExamContext(rows)
    expect(context).not.toBeNull()
    expect(context?.examTypeId).toBe("A")
  })

  it("prefers the newer academic session when counts are equal", () => {
    const rows = [
      row({ examTypeId: "Older" }),
      row({ examTypeId: "Older" }),
      row({
        examTypeId: "Newer",
        academicSessionId: "session-2",
        sessionStart: new Date("2027-04-01T00:00:00.000Z"),
        sessionName: "2027-28",
      }),
      row({
        examTypeId: "Newer",
        academicSessionId: "session-2",
        sessionStart: new Date("2027-04-01T00:00:00.000Z"),
        sessionName: "2027-28",
      }),
    ]
    const context = selectBestExamContext(rows)
    expect(context?.examTypeId).toBe("Newer")
    expect(context?.academicSessionId).toBe("session-2")
    expect(context?.sessionName).toBe("2027-28")
  })

  it("breaks equal-count, same-session ties deterministically by name", () => {
    const rows = [
      row({ examTypeId: "Zebra" }),
      row({ examTypeId: "Zebra" }),
      row({ examTypeId: "Alpha" }),
      row({ examTypeId: "Alpha" }),
    ]
    const context = selectBestExamContext(rows)
    expect(context?.examTypeId).toBe("Alpha")
  })

  it("reports the min exam window across the chosen context", () => {
    const rows = [
      row({ startDate: new Date("2026-06-01T00:00:00.000Z"), endDate: new Date("2026-06-03T00:00:00.000Z") }),
      row({ startDate: new Date("2026-06-02T00:00:00.000Z"), endDate: new Date("2026-06-10T00:00:00.000Z") }),
    ]
    const context = selectBestExamContext(rows)
    expect(context?.from.toISOString()).toBe("2026-06-01T00:00:00.000Z")
    expect(context?.to.toISOString()).toBe("2026-06-10T00:00:00.000Z")
  })
})

describe("computeClassRanking (database-free)", () => {
  it("returns an empty ranking with no rows", () => {
    expect(computeClassRanking([])).toEqual([])
  })

  it("groups per-class averages and ranks descending", () => {
    const ranked = computeClassRanking([
      { className: "9", percentage: 70 },
      { className: "9", percentage: 90 },
      { className: "8", percentage: 60 },
      { className: "8", percentage: 66 },
      { className: "7", percentage: 100 },
    ])
    expect(ranked).toEqual([
      { rank: 1, name: "7", performance: 100, students: 1 },
      { rank: 2, name: "9", performance: 80, students: 2 },
      { rank: 3, name: "8", performance: 63, students: 2 },
    ])
  })

  it("rounds class averages to 1 decimal", () => {
    const ranked = computeClassRanking([
      { className: "9", percentage: 90 },
      { className: "9", percentage: 83 },
    ])
    expect(ranked[0].performance).toBe(86.5)
  })

  it("breaks performance ties deterministically by class name", () => {
    const ranked = computeClassRanking([
      { className: "B", percentage: 80 },
      { className: "A", percentage: 80 },
    ])
    expect(ranked.map((r) => r.name)).toEqual(["A", "B"])
  })
})