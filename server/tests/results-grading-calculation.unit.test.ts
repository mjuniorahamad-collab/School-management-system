import { describe, expect, it } from "vitest"
import {
  computeResultAggregate,
  deriveSubjectMark,
  gradeForPercentage,
  isPassingScore,
  roundScore,
  scorePercentage,
  toNumber,
} from "../src/modules/results/grading.js"
import type { GradedMark, GradingBandRule } from "../src/modules/results/grading.js"

// Independent calculation-verification suite for the pure grading/aggregate
// rules. Complements results.unit.test.ts with grade-cutoff boundaries,
// division-by-zero, absent/null marks and decimal totals.

const PASS_40_BANDS: GradingBandRule[] = [
  { minPercent: 0, maxPercent: 39, grade: "F" },
  { minPercent: 40, maxPercent: 49, grade: "D" },
  { minPercent: 50, maxPercent: 59, grade: "C" },
  { minPercent: 60, maxPercent: 69, grade: "B" },
  { minPercent: 70, maxPercent: 79, grade: "A" },
  { minPercent: 80, maxPercent: 89, grade: "A+" },
  { minPercent: 90, maxPercent: 100, grade: "A++" },
]

describe("scorePercentage (calculation)", () => {
  it("computes clean integer percentages", () => {
    expect(scorePercentage(700, 1000)).toBe(70)
    expect(scorePercentage(0, 100)).toBe(0)
    expect(scorePercentage(100, 100)).toBe(100)
  })

  it("rounds repeating decimals to two places", () => {
    expect(scorePercentage(333, 1000)).toBe(33.3)
    expect(scorePercentage(1, 3)).toBe(33.33)
    expect(scorePercentage(2, 3)).toBe(66.67)
    expect(scorePercentage(33.33, 50)).toBe(66.66)
  })

  it("allows a score above the maximum (extra credit) to exceed 100", () => {
    expect(scorePercentage(110, 100)).toBe(110)
  })

  it("throws for a zero maximum (division by zero)", () => {
    expect(() => scorePercentage(5, 0)).toThrow(RangeError)
  })

  it("throws for a negative maximum", () => {
    expect(() => scorePercentage(5, -1)).toThrow(RangeError)
  })

  it("throws for a non-finite obtained score", () => {
    expect(() => scorePercentage(Number.NaN, 100)).toThrow(RangeError)
  })

  it("throws for a non-finite maximum", () => {
    expect(() => scorePercentage(5, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("rejects a negative obtained score", () => {
    // FIXED: the sign of the obtained score is now checked; marks are also
    // validated upstream as >= 0.
    expect(() => scorePercentage(-5, 100)).toThrow(RangeError)
    expect(() => scorePercentage(-5, 100)).toThrow(/non-negative/)
  })
})

describe("roundScore (calculation)", () => {
  it("rounds to two places by default", () => {
    expect(roundScore(66.666666)).toBe(66.67)
    expect(roundScore(12.3456)).toBe(12.35)
  })

  it("honours an explicit precision", () => {
    expect(roundScore(33.333333, 4)).toBe(33.3333)
  })

  it("rounds below a half-cent down to zero", () => {
    expect(roundScore(0.0049)).toBe(0)
  })

  it("rounds an exact half up via the epsilon nudge", () => {
    expect(roundScore(0.005)).toBe(0.01)
    expect(roundScore(1.005)).toBe(1.01)
  })

  it("repairs a classic float sum", () => {
    expect(roundScore(0.1 + 0.2)).toBe(0.3)
  })
})

describe("isPassingScore (calculation)", () => {
  it("passes at the pass mark (inclusive)", () => {
    expect(isPassingScore(40, 40)).toBe(true)
  })

  it("passes above the pass mark", () => {
    expect(isPassingScore(41, 40)).toBe(true)
    expect(isPassingScore(40.01, 40)).toBe(true)
  })

  it("fails just below the pass mark", () => {
    expect(isPassingScore(39.99, 40)).toBe(false)
  })

  it("treats zero pass marks as a pass", () => {
    expect(isPassingScore(0, 0)).toBe(true)
  })

  it("passes against a negative pass mark", () => {
    expect(isPassingScore(0, -1)).toBe(true)
  })
})

describe("gradeForPercentage (calculation, cutoff boundary)", () => {
  it("rounds the percentage before lookup (39.99 -> 40 -> D)", () => {
    // gradeForPercentage rounds first: const target = Math.round(percentage) (:151).
    expect(gradeForPercentage(39.99, PASS_40_BANDS)).toBe("D")
  })

  it("leaves a sub-half percentage in the lower band (39.49 -> F)", () => {
    expect(gradeForPercentage(39.49, PASS_40_BANDS)).toBe("F")
  })

  it("rounds an exact half up into the next band (39.5 -> D)", () => {
    expect(gradeForPercentage(39.5, PASS_40_BANDS)).toBe("D")
  })

  it("matches an inclusive band minimum (40 -> D)", () => {
    expect(gradeForPercentage(40, PASS_40_BANDS)).toBe("D")
  })

  it("rounds the next cutoff (89.49 -> A+, 89.5 -> A++)", () => {
    expect(gradeForPercentage(89.49, PASS_40_BANDS)).toBe("A+")
    expect(gradeForPercentage(89.5, PASS_40_BANDS)).toBe("A++")
  })

  it("matches an inclusive band maximum (100 -> A++)", () => {
    expect(gradeForPercentage(100, PASS_40_BANDS)).toBe("A++")
  })

  it("rounds 100.49 down to 100 but 100.5 up to an uncovered 101", () => {
    expect(gradeForPercentage(100.49, PASS_40_BANDS)).toBe("A++")
    expect(gradeForPercentage(100.5, PASS_40_BANDS)).toBeNull()
  })

  it("grades zero and a rounded-to-zero negative", () => {
    expect(gradeForPercentage(0, PASS_40_BANDS)).toBe("F")
    expect(gradeForPercentage(-0.5, PASS_40_BANDS)).toBe("F")
  })

  it("returns null below zero once rounding leaves the bands", () => {
    expect(gradeForPercentage(-0.51, PASS_40_BANDS)).toBeNull()
  })

  it("returns null for an empty band list", () => {
    expect(gradeForPercentage(50, [])).toBeNull()
  })

  it("returns null for a gap between bands", () => {
    const gapped: GradingBandRule[] = [
      { minPercent: 0, maxPercent: 39, grade: "F" },
      { minPercent: 60, maxPercent: 100, grade: "A" },
    ]
    expect(gradeForPercentage(50, gapped)).toBeNull()
  })

  it("uses the first matching band when bounds overlap", () => {
    const overlapping: GradingBandRule[] = [
      { minPercent: 0, maxPercent: 100, grade: "GENERIC" },
      { minPercent: 90, maxPercent: 100, grade: "TOP" },
    ]
    expect(gradeForPercentage(95, overlapping)).toBe("GENERIC")
  })
})

describe("deriveSubjectMark (calculation)", () => {
  const bands: GradingBandRule[] = [{ minPercent: 0, maxPercent: 100, grade: "G" }]

  it("derives percentage, grade and pass for a scored subject", () => {
    expect(
      deriveSubjectMark({ obtainedMarks: 40, isAbsent: false, maxMarks: 50, passMarks: 25, bands }),
    ).toEqual({ percentage: 80, grade: "G", isPass: true })
  })

  it("treats an absent subject as a null derivation even with a mark", () => {
    expect(
      deriveSubjectMark({ obtainedMarks: 80, isAbsent: true, maxMarks: 50, passMarks: 25, bands }),
    ).toEqual({ percentage: null, grade: null, isPass: null })
  })

  it("treats a cleared cell (no marks) as a null derivation", () => {
    expect(
      deriveSubjectMark({ obtainedMarks: null, isAbsent: false, maxMarks: 50, passMarks: 25, bands }),
    ).toEqual({ percentage: null, grade: null, isPass: null })
  })

  it("fails a subject just below the pass mark", () => {
    const result = deriveSubjectMark({ obtainedMarks: 24, isAbsent: false, maxMarks: 50, passMarks: 25, bands })
    expect(result.isPass).toBe(false)
  })

  it("passes a subject exactly at the pass mark", () => {
    const result = deriveSubjectMark({ obtainedMarks: 25, isAbsent: false, maxMarks: 50, passMarks: 25, bands })
    expect(result.isPass).toBe(true)
  })

  it("returns a null derivation for a cleared cell with a zero maximum", () => {
    expect(
      deriveSubjectMark({ obtainedMarks: null, isAbsent: false, maxMarks: 0, passMarks: 0, bands }),
    ).toEqual({ percentage: null, grade: null, isPass: null })
  })

  it("throws when a scored subject has a zero maximum (division by zero)", () => {
    expect(() =>
      deriveSubjectMark({ obtainedMarks: 10, isAbsent: false, maxMarks: 0, passMarks: 0, bands }),
    ).toThrow(RangeError)
  })

  it("derives a zero score for a present student", () => {
    expect(
      deriveSubjectMark({ obtainedMarks: 0, isAbsent: false, maxMarks: 50, passMarks: 25, bands }),
    ).toEqual({ percentage: 0, grade: "G", isPass: false })
  })
})

describe("computeResultAggregate (calculation)", () => {
  const twoBand: GradingBandRule[] = [
    { minPercent: 80, maxPercent: 100, grade: "A" },
    { minPercent: 0, maxPercent: 79, grade: "F" },
  ]
  const base = {
    subjectCount: 2,
    subjectMaxMarks: { mat: 100, sci: 50 } as Record<string, number>,
    subjectPassMarks: { mat: 40, sci: 25 } as Record<string, number>,
    marks: [] as GradedMark[],
    bands: twoBand,
  }

  it("aggregates a complete set over the total max marks", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 80, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: 40, isAbsent: false },
      ],
    })
    expect(result).toEqual({
      totalObtained: 120,
      totalMaxMarks: 150,
      totalPercentage: 80,
      grade: "A",
      isPass: true,
      isComplete: true,
    })
  })

  it("fails the overall result when any subject fails", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 20, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: 40, isAbsent: false },
      ],
    })
    expect(result.isComplete).toBe(true)
    expect(result.isPass).toBe(false)
    expect(result.grade).toBe("F")
  })

  it("returns a null aggregate for an absent subject (never zero-penalized)", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 80, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: null, isAbsent: true },
      ],
    })
    expect(result).toEqual({
      totalObtained: null,
      totalMaxMarks: null,
      totalPercentage: null,
      grade: null,
      isPass: null,
      isComplete: false,
    })
  })

  it("treats a cleared (null) mark as incomplete", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 80, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: null, isAbsent: false },
      ],
    })
    expect(result.isComplete).toBe(false)
  })

  it("treats a missing mark (fewer marks than subjects) as incomplete", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [{ examSubjectId: "mat", obtainedMarks: 80, isAbsent: false }],
    })
    expect(result.isComplete).toBe(false)
  })

  it("treats extra marks as incomplete", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 80, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: 40, isAbsent: false },
        { examSubjectId: "eng", obtainedMarks: 50, isAbsent: false },
      ],
    })
    expect(result.isComplete).toBe(false)
    expect(result.totalPercentage).toBeNull()
  })

  it("returns an empty aggregate for zero subjects", () => {
    const result = computeResultAggregate({
      ...base,
      subjectCount: 0,
      marks: [],
    })
    expect(result).toEqual({
      totalObtained: null,
      totalMaxMarks: null,
      totalPercentage: null,
      grade: null,
      isPass: null,
      isComplete: false,
    })
  })

  it("returns an empty aggregate when every maximum is zero", () => {
    const result = computeResultAggregate({
      subjectCount: 1,
      subjectMaxMarks: { a: 0 },
      subjectPassMarks: { a: 0 },
      marks: [{ examSubjectId: "a", obtainedMarks: 50, isAbsent: false }],
      bands: twoBand,
    })
    expect(result).toEqual({
      totalObtained: null,
      totalMaxMarks: null,
      totalPercentage: null,
      grade: null,
      isPass: null,
      isComplete: false,
    })
  })

  it("aggregates decimal maxima to an exact whole total", () => {
    const result = computeResultAggregate({
      subjectCount: 3,
      subjectMaxMarks: { a: 33.33, b: 33.33, c: 33.34 },
      subjectPassMarks: { a: 0, b: 0, c: 0 },
      marks: [
        { examSubjectId: "a", obtainedMarks: 33.33, isAbsent: false },
        { examSubjectId: "b", obtainedMarks: 33.33, isAbsent: false },
        { examSubjectId: "c", obtainedMarks: 33.34, isAbsent: false },
      ],
      bands: PASS_40_BANDS,
    })
    expect(result).toMatchObject({
      totalObtained: 100,
      totalMaxMarks: 100,
      totalPercentage: 100,
      grade: "A++",
      isPass: true,
      isComplete: true,
    })
  })

  it("applies the grade boundary at the aggregate level (39.99 -> D, below pass)", () => {
    const result = computeResultAggregate({
      subjectCount: 1,
      subjectMaxMarks: { a: 100 },
      subjectPassMarks: { a: 40 },
      marks: [{ examSubjectId: "a", obtainedMarks: 39.99, isAbsent: false }],
      bands: PASS_40_BANDS,
    })
    expect(result.totalPercentage).toBe(39.99)
    expect(result.grade).toBe("D")
    expect(result.isPass).toBe(false)
  })

  it("fails overall when a subject has no configured pass mark", () => {
    const result = computeResultAggregate({
      ...base,
      subjectPassMarks: { mat: 40 },
      marks: [
        { examSubjectId: "mat", obtainedMarks: 50, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: 50, isAbsent: false },
      ],
    })
    expect(result.isComplete).toBe(true)
    expect(result.isPass).toBe(false)
  })

  it("passes overall when every subject meets its pass mark", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 45, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: 30, isAbsent: false },
      ],
    })
    expect(result.isPass).toBe(true)
  })
})

describe("toNumber (calculation)", () => {
  it("passes a raw number through", () => {
    expect(toNumber(95.5)).toBe(95.5)
  })

  it("parses a numeric string", () => {
    expect(toNumber("66.67")).toBe(66.67)
  })

  it("coerces a Prisma Decimal-like object", () => {
    expect(toNumber({ toString: () => "88.50" })).toBe(88.5)
  })

  it("accepts exponent notation in a string", () => {
    expect(toNumber("1e3")).toBe(1000)
  })

  it("accepts a whitespace-padded numeric string", () => {
    expect(toNumber(" 12 ")).toBe(12)
  })

  it("throws on an unparseable string", () => {
    expect(() => toNumber("abc")).toThrow(RangeError)
  })

  it("throws on null", () => {
    expect(() => toNumber(null)).toThrow(RangeError)
  })

  it("throws on undefined", () => {
    expect(() => toNumber(undefined)).toThrow(RangeError)
  })

  it("throws on a boolean", () => {
    expect(() => toNumber(true)).toThrow(RangeError)
  })
})
