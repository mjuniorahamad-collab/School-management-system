// Unit coverage for the grade-history rule.
//
// THE RULE: a grade is a historical fact. Retiring a grading band or re-routing
// a range must never silently rewrite a grade that was already awarded.
//
//   - Unchanged percentage → the stored grade is preserved.
//   - Changed percentage   → the grade is recomputed (explicit regrade).
//
// These helpers are the single source of truth for that rule; the service layer
// (result.service.ts) and the database-backed suite
// (results-grade-history.integration.test.ts) both build on them.

import { describe, expect, it } from "vitest"
import {
  resolveAggregateGrade,
  resolveMarkGrade,
  type ResultAggregate,
} from "../src/modules/results/grading.js"

describe("resolveMarkGrade", () => {
  it("takes the derived grade when the mark was never graded before", () => {
    expect(
      resolveMarkGrade({
        derived: { percentage: 88, grade: "B", isPass: true },
        stored: null,
      }),
    ).toBe("B")
  })

  it("takes the derived grade when the stored row has no recorded percentage", () => {
    expect(
      resolveMarkGrade({
        derived: { percentage: 88, grade: "B", isPass: true },
        stored: { percentage: null, grade: null },
      }),
    ).toBe("B")
  })

  it("takes the derived grade when the mark is no longer scored", () => {
    expect(
      resolveMarkGrade({
        derived: { percentage: null, grade: null, isPass: null },
        stored: { percentage: 88, grade: "B" },
      }),
    ).toBeNull()
  })

  it("keeps the awarded grade when the percentage did not change", () => {
    // The bands now award "B2" for 88%, but the mark was awarded "B".
    expect(
      resolveMarkGrade({
        derived: { percentage: 88, grade: "B2", isPass: true },
        stored: { percentage: 88, grade: "B" },
      }),
    ).toBe("B")
  })

  it("regrades when the percentage changed", () => {
    expect(
      resolveMarkGrade({
        derived: { percentage: 95, grade: "A+", isPass: true },
        stored: { percentage: 88, grade: "B" },
      }),
    ).toBe("A+")
  })

  it("keeps a stored grade of null when the percentage did not change", () => {
    // No band covered the percentage when it was written; the re-routed bands
    // must not invent a grade for it.
    expect(
      resolveMarkGrade({
        derived: { percentage: 88, grade: "B2", isPass: true },
        stored: { percentage: 88, grade: null },
      }),
    ).toBeNull()
  })
})

describe("resolveAggregateGrade", () => {
  const aggregate = (overrides: Partial<ResultAggregate> = {}): ResultAggregate => ({
    totalObtained: 172,
    totalMaxMarks: 200,
    totalPercentage: 86,
    grade: "B2",
    isPass: true,
    isComplete: true,
    ...overrides,
  })

  it("takes the derived grade when the result was never graded before", () => {
    expect(resolveAggregateGrade({ aggregate: aggregate(), stored: null })).toBe("B2")
  })

  it("takes the derived grade when the stored aggregate has no recorded percentage", () => {
    expect(
      resolveAggregateGrade({
        aggregate: aggregate(),
        stored: { percentage: null, grade: null },
      }),
    ).toBe("B2")
  })

  it("keeps the awarded aggregate grade when the total did not change", () => {
    expect(
      resolveAggregateGrade({
        aggregate: aggregate(),
        stored: { percentage: 86, grade: "B" },
      }),
    ).toBe("B")
  })

  it("regrades the aggregate when the total moved", () => {
    expect(
      resolveAggregateGrade({
        aggregate: aggregate({ totalPercentage: 89.5, grade: "A+" }),
        stored: { percentage: 86, grade: "B" },
      }),
    ).toBe("A+")
  })

  it("takes the derived grade when the aggregate is no longer complete", () => {
    expect(
      resolveAggregateGrade({
        aggregate: aggregate({
          totalObtained: null,
          totalMaxMarks: null,
          totalPercentage: null,
          grade: null,
          isPass: null,
          isComplete: false,
        }),
        stored: { percentage: 86, grade: "B" },
      }),
    ).toBeNull()
  })
})
