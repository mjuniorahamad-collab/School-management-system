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
import { assignCompetitionRanks } from "../src/modules/results/ranking.js"

describe("scorePercentage (database-free)", () => {
  it("computes a percentage rounded to 2 decimal places", () => {
    expect(scorePercentage(700, 1000)).toBe(70)
    expect(scorePercentage(333, 1000)).toBeCloseTo(33.3)
    expect(scorePercentage(2, 3)).toBeCloseTo(66.67)
    expect(scorePercentage(1, 3)).toBeCloseTo(33.33)
  })

  it("rejects non-positive bounds", () => {
    expect(() => scorePercentage(0, 0)).toThrow(RangeError)
    expect(() => scorePercentage(10, -5)).toThrow(RangeError)
  })
})

describe("roundScore (database-free)", () => {
  it("rounds to the requested precision", () => {
    expect(roundScore(66.666666)).toBeCloseTo(66.67)
    expect(roundScore(33.333333, 4)).toBeCloseTo(33.3333)
    expect(roundScore(0.0049)).toBe(0)
  })
})

describe("isPassingScore (database-free)", () => {
  it("passes at or above the pass mark", () => {
    expect(isPassingScore(40, 40)).toBe(true)
    expect(isPassingScore(41, 40)).toBe(true)
    expect(isPassingScore(39.5, 40)).toBe(false)
  })
})

describe("gradeForPercentage (database-free)", () => {
  const bands = [
    { minPercent: 90, maxPercent: 100, grade: "A+" },
    { minPercent: 80, maxPercent: 89, grade: "A" },
    { minPercent: 70, maxPercent: 79, grade: "B" },
    { minPercent: 60, maxPercent: 69, grade: "C" },
    { minPercent: 50, maxPercent: 59, grade: "D" },
    { minPercent: 0, maxPercent: 49, grade: "F" },
  ]

  it("matches inclusive band bounds on the rounded integer", () => {
    expect(gradeForPercentage(89.4, bands)).toBe("A")
    expect(gradeForPercentage(89.5, bands)).toBe("A+")
    expect(gradeForPercentage(90, bands)).toBe("A+")
    expect(gradeForPercentage(100, bands)).toBe("A+")
    expect(gradeForPercentage(49.49, bands)).toBe("F")
    expect(gradeForPercentage(79.4, bands)).toBe("B")
  })

  it("returns null when no band covers the percentage", () => {
    expect(gradeForPercentage(101, bands)).toBeNull()
    expect(gradeForPercentage(-1, bands)).toBeNull()
  })

  it("uses the lowest sortOrder band when bounds overlap", () => {
    const overlapping = [
      { minPercent: 0, maxPercent: 100, grade: "GENERIC" },
      { minPercent: 90, maxPercent: 100, grade: "TOP" },
    ]
    expect(gradeForPercentage(95, overlapping)).toBe("GENERIC")
  })
})

describe("toNumber (database-free)", () => {
  it("coerces raw numbers, numeric strings, and Prisma Decimal objects", () => {
    expect(toNumber(95.5)).toBe(95.5)
    expect(toNumber("66.67")).toBeCloseTo(66.67)
    expect(toNumber({ toString: () => "88.50" })).toBe(88.5)
  })

  it("throws on unparseable input", () => {
    expect(() => toNumber("abc")).toThrow(RangeError)
    expect(() => toNumber(null)).toThrow(RangeError)
  })
})

describe("assignCompetitionRanks (database-free)", () => {
  it("ranks complete results high-to-low with standard competition ranks", () => {
    const result = assignCompetitionRanks([
      { id: "a", totalPercentage: 90, isComplete: true },
      { id: "b", totalPercentage: 80, isComplete: true },
      { id: "c", totalPercentage: 70, isComplete: true },
    ])
    const byId = new Map(result.map((row) => [row.id, row.rank]))
    expect(byId.get("a")).toBe(1)
    expect(byId.get("b")).toBe(2)
    expect(byId.get("c")).toBe(3)
  })

  it("gives tied percentages the same rank and skips the tied count", () => {
    const result = assignCompetitionRanks([
      { id: "a", totalPercentage: 88.5, isComplete: true },
      { id: "b", totalPercentage: 88.5, isComplete: true },
      { id: "c", totalPercentage: 75, isComplete: true },
      { id: "d", totalPercentage: 75, isComplete: true },
      { id: "e", totalPercentage: 60, isComplete: true },
    ])
    const byId = new Map(result.map((row) => [row.id, row.rank]))
    expect(byId.get("a")).toBe(1)
    expect(byId.get("b")).toBe(1)
    expect(byId.get("c")).toBe(3)
    expect(byId.get("d")).toBe(3)
    expect(byId.get("e")).toBe(5)
  })

  it("excludes incomplete or ungraded results from ranking", () => {
    const byId = new Map(
      assignCompetitionRanks([
        { id: "a", totalPercentage: 90, isComplete: true },
        { id: "b", totalPercentage: 95, isComplete: false },
        { id: "c", totalPercentage: null, isComplete: false },
      ]).map((row) => [row.id, row.rank]),
    )
    expect(byId.get("a")).toBe(1)
    expect(byId.get("b")).toBeNull()
    expect(byId.get("c")).toBeNull()
  })

  it("ranks a single complete result and returns null ranks for an empty set", () => {
    const single = assignCompetitionRanks([{ id: "x", totalPercentage: 55, isComplete: true }])
    expect(single).toEqual([{ id: "x", rank: 1 }])
    expect(assignCompetitionRanks([])).toEqual([])
  })
})

describe("deriveSubjectMark (database-free)", () => {
  const bands = [{ minPercent: 0, maxPercent: 100, grade: "G" }]

  it("derives percentage, grade, and pass for a scored subject", () => {
    expect(
      deriveSubjectMark({
        obtainedMarks: 40,
        isAbsent: false,
        maxMarks: 50,
        passMarks: 25,
        bands,
      }),
    ).toEqual({ percentage: 80, grade: "G", isPass: true })
  })

  it("treats absent as a null derivation (never a zero)", () => {
    expect(
      deriveSubjectMark({
        obtainedMarks: 0,
        isAbsent: true,
        maxMarks: 50,
        passMarks: 25,
        bands,
      }),
    ).toEqual({ percentage: null, grade: null, isPass: null })
  })

  it("treats a cleared cell (no marks) as a null derivation", () => {
    expect(
      deriveSubjectMark({
        obtainedMarks: null,
        isAbsent: false,
        maxMarks: 50,
        passMarks: 25,
        bands,
      }),
    ).toEqual({ percentage: null, grade: null, isPass: null })
  })
})

describe("computeResultAggregate (database-free)", () => {
  const bands = [
    { minPercent: 80, maxPercent: 100, grade: "A" },
    { minPercent: 0, maxPercent: 79, grade: "F" },
  ]
  const base = {
    subjectCount: 2,
    subjectMaxMarks: { mat: 100, sci: 50 },
    subjectPassMarks: { mat: 40, sci: 25 },
    marks: [] as { examSubjectId: string; obtainedMarks: number | null; isAbsent: boolean }[],
    bands,
  }

  it("aggregates a complete set over total max marks", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 80, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: 40, isAbsent: false },
      ],
    })
    expect(result).toMatchObject({
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

  it("excludes absent subjects from totals instead of penalizing as zero", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [
        { examSubjectId: "mat", obtainedMarks: 80, isAbsent: false },
        { examSubjectId: "sci", obtainedMarks: null, isAbsent: true },
      ],
    })
    // Incomplete set (absent subject) → no aggregate, no grade, not ranked.
    expect(result).toMatchObject({
      totalObtained: null,
      totalMaxMarks: null,
      totalPercentage: null,
      grade: null,
      isPass: null,
      isComplete: false,
    })
  })

  it("treats a missing mark as incomplete", () => {
    const result = computeResultAggregate({
      ...base,
      marks: [{ examSubjectId: "mat", obtainedMarks: 80, isAbsent: false }],
    })
    expect(result.isComplete).toBe(false)
  })
})