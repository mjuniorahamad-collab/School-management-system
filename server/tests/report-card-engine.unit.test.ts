import { describe, expect, it } from "vitest"
import { ApiError } from "../src/lib/ApiError.js"
import { computeAnnualReport } from "../src/modules/report-cards/report-card.aggregation.js"
import {
  makeRational,
  parseDecimal,
  roundHalfUp,
  toFixedDecimal,
  validateExamWeights,
} from "../src/modules/report-cards/report-card.rounding.js"
import {
  resolveExamType,
  resolveSchemeExams,
} from "../src/modules/report-cards/report-card.resolution.js"
import {
  assertMarkStatusEntryAllowed,
  examWeightSchema,
  markStatusSchema,
} from "../src/modules/report-cards/report-card.schema.js"
import type {
  AnnualPolicyInput,
  AnnualSubjectInput,
  ExamInstanceInput,
  StudentExamResultRow,
  SubjectExamMark,
} from "../src/modules/report-cards/report-card.types.js"

// ────────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────────

function roundDecimal(value: string, places = 2): string {
  return toFixedDecimal(parseDecimal(value), places)
}

function mark(
  examId: string,
  status: SubjectExamMark["status"],
  obtainedMarks: string | null = null,
  maxMarks = "100",
): SubjectExamMark {
  return { examId, status, obtainedMarks, maxMarks }
}

function scored(examId: string, obtained: string, max = "100"): SubjectExamMark {
  return mark(examId, "SCORED", obtained, max)
}

function subject(
  subjectId: string,
  marks: SubjectExamMark[],
  isCore = false,
): AnnualSubjectInput {
  return { subjectId, isCore, marks }
}

function basePolicy(overrides: Partial<AnnualPolicyInput> = {}): AnnualPolicyInput {
  return {
    aggregationPolicy: "RAW",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "ALL_SUBJECTS",
    annualSubjectPassPercent: "40",
    overallPassPercent: null,
    maxFailedSubjects: null,
    coreSubjectIds: [],
    gradingBands: [],
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// §5 — exact-rational decimal rounding
// ────────────────────────────────────────────────────────────────────────────

describe("exact-rational rounding (spec §5)", () => {
  const acceptance: Array<[string, string]> = [
    ["39.995", "40.00"],
    ["40.005", "40.01"],
    ["1.005", "1.01"],
    ["0.005", "0.01"],
    ["2.675", "2.68"],
    ["89.995", "90.00"],
    ["99.995", "100.00"],
    ["0.0049", "0.00"],
    ["39.994", "39.99"],
    ["66.66", "66.66"],
  ]

  it.each(acceptance)("rounds %s to %s (half-up, 2dp)", (input, expected) => {
    expect(roundDecimal(input)).toBe(expected)
  })

  it("rounds exact rationals, not binary floats", () => {
    expect(toFixedDecimal(roundHalfUp(makeRational(100n, 3n)))).toBe("33.33")
    expect(toFixedDecimal(roundHalfUp(makeRational(200n, 3n)))).toBe("66.67")
  })

  it("reduces rationals to lowest terms", () => {
    expect(makeRational(2n, 4n)).toEqual({ n: 1n, d: 2n })
    expect(makeRational(-2n, -4n)).toEqual({ n: 1n, d: 2n })
  })

  it("rejects non-decimal input", () => {
    expect(() => parseDecimal("1e3")).toThrow(RangeError)
    expect(() => parseDecimal("abc")).toThrow(RangeError)
    expect(() => parseDecimal("")).toThrow(RangeError)
    expect(() => parseDecimal("1.2.3")).toThrow(RangeError)
  })

  it("validates the Σw = 1 ± 0.0001 weight rule", () => {
    expect(validateExamWeights([parseDecimal("0.3"), parseDecimal("0.3"), parseDecimal("0.4")])).toBeNull()
    // exact boundary of the tolerance is accepted
    expect(validateExamWeights([parseDecimal("0.5"), parseDecimal("0.5001")])).toBeNull()
    expect(validateExamWeights([parseDecimal("0.5"), parseDecimal("0.51")])).not.toBeNull()
    expect(validateExamWeights([parseDecimal("0.5"), parseDecimal("0")])).not.toBeNull()
    expect(validateExamWeights([])).not.toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// §3 — exam resolution
// ────────────────────────────────────────────────────────────────────────────

describe("exam resolution (spec §3)", () => {
  const scheme = ["term"]

  function resolve(params: {
    results?: StudentExamResultRow[]
    instances?: ExamInstanceInput[]
    classId?: string
  }) {
    return resolveExamType({
      examTypeId: "term",
      schemeExamTypeIds: scheme,
      studentClassId: params.classId ?? "class-1",
      studentSectionId: "section-a",
      results: params.results ?? [],
      instances: params.instances ?? [],
    })
  }

  function instance(
    id: string,
    status: ExamInstanceInput["status"],
    classId = "class-1",
    sectionId: string | null = "section-a",
  ): ExamInstanceInput {
    return { id, examTypeId: "term", classId, sectionId, status }
  }

  it("is OUT_OF_SCOPE when the exam type is not in the scheme", () => {
    const result = resolveExamType({
      examTypeId: "midterm",
      schemeExamTypeIds: ["term"],
      studentClassId: "class-1",
      studentSectionId: null,
      results: [],
      instances: [],
    })
    expect(result.status).toBe("OUT_OF_SCOPE")
    expect(result.blocks).toBe(false)
  })

  it("RESOLVES a single row for a FINAL instance", () => {
    const result = resolve({
      results: [{ examId: "e1", examTypeId: "term", classId: "class-1", sectionId: "section-a" }],
      instances: [instance("e1", "FINAL")],
    })
    expect(result.status).toBe("RESOLVED")
    expect(result.examId).toBe("e1")
    expect(result.blocks).toBe(false)
  })

  it("is NOT_FINAL for a single row on a non-FINAL instance", () => {
    const result = resolve({
      results: [{ examId: "e1", examTypeId: "term", classId: "class-1", sectionId: "section-a" }],
      instances: [instance("e1", "PUBLISHED")],
    })
    expect(result.status).toBe("NOT_FINAL")
    expect(result.blocks).toBe(false)
  })

  it("is AMBIGUOUS(CROSS_SECTION_DUPLICATE) for two rows in one class, two sections", () => {
    const result = resolve({
      results: [
        { examId: "e1", examTypeId: "term", classId: "class-1", sectionId: "section-a" },
        { examId: "e2", examTypeId: "term", classId: "class-1", sectionId: "section-b" },
      ],
      instances: [instance("e1", "FINAL"), instance("e2", "FINAL", "class-1", "section-b")],
    })
    expect(result.status).toBe("AMBIGUOUS")
    expect(result.reason).toBe("CROSS_SECTION_DUPLICATE")
    expect(result.blocks).toBe(true)
  })

  it("is AMBIGUOUS(CLASS_CHANGE) for two rows spanning classes", () => {
    const result = resolve({
      results: [
        { examId: "e1", examTypeId: "term", classId: "class-1", sectionId: null },
        { examId: "e2", examTypeId: "term", classId: "class-2", sectionId: null },
      ],
      instances: [],
    })
    expect(result.status).toBe("AMBIGUOUS")
    expect(result.reason).toBe("CLASS_CHANGE")
    expect(result.blocks).toBe(true)
  })

  it("is AMBIGUOUS(CLASS_CHANGE) when the only row is a different class than placement", () => {
    const result = resolve({
      results: [{ examId: "e1", examTypeId: "term", classId: "class-2", sectionId: null }],
      instances: [instance("e1", "FINAL", "class-2", null)],
    })
    expect(result.status).toBe("AMBIGUOUS")
    expect(result.reason).toBe("CLASS_CHANGE")
  })

  it("is MISSING(NO_RESULT_ROW) when a FINAL class instance has no student row", () => {
    const result = resolve({ instances: [instance("e1", "FINAL")] })
    expect(result.status).toBe("MISSING")
    expect(result.reason).toBe("NO_RESULT_ROW")
    expect(result.blocks).toBe(true)
  })

  it("is NOT_FINAL when an instance exists but none is FINAL", () => {
    const result = resolve({ instances: [instance("e1", "DRAFT")] })
    expect(result.status).toBe("NOT_FINAL")
    expect(result.blocks).toBe(false)
  })

  it("is MISSING(NO_EXAM_INSTANCE) when no instance exists for the class", () => {
    const result = resolve({ instances: [] })
    expect(result.status).toBe("MISSING")
    expect(result.reason).toBe("NO_EXAM_INSTANCE")
    expect(result.blocks).toBe(true)
  })

  it("is AMBIGUOUS(CLASS_CHANGE) for a lone instance in another class", () => {
    const result = resolve({ instances: [instance("e1", "FINAL", "class-2", null)] })
    expect(result.status).toBe("AMBIGUOUS")
    expect(result.reason).toBe("CLASS_CHANGE")
  })

  it("is MISSING(IMPLICIT) for multiple class instances with no match", () => {
    const result = resolve({
      instances: [instance("e1", "FINAL"), instance("e2", "PUBLISHED", "class-1", "section-a")],
    })
    expect(result.status).toBe("MISSING")
    expect(result.reason).toBe("IMPLICIT")
    expect(result.requiresReview).toBe(true)
  })

  it("reports whether any scheme resolution blocks generation", () => {
    const { resolutions, blocked, requiresReview } = resolveSchemeExams(["term"], {
      studentClassId: "class-1",
      studentSectionId: "section-a",
      results: [],
      instances: [],
    })
    expect(resolutions).toHaveLength(1)
    expect(blocked).toBe(true)
    expect(requiresReview).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// §5 — subject aggregation
// ────────────────────────────────────────────────────────────────────────────

describe("subject annual aggregation (spec §5)", () => {
  it("pools RAW across exams (Σ obtained / Σ max)", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "40", "100"), scored("e2", "50", "50")])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(result.subjects[0]!.percentage).toBe("60.00")
    expect(result.subjects[0]!.outcome).toBe("PASS")
  })

  it("passes a subject on the rounded percentage boundary (>=)", () => {
    const exact = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "60", "100")])],
      examWeights: {},
      policy: basePolicy({ annualSubjectPassPercent: "60" }),
    })
    expect(exact.subjects[0]!.outcome).toBe("PASS")

    const justAbove = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "60", "100")])],
      examWeights: {},
      policy: basePolicy({ annualSubjectPassPercent: "60.01" }),
    })
    expect(justAbove.subjects[0]!.outcome).toBe("FAIL")
  })

  it("excludes NOT_APPLICABLE exams from the subject computation", () => {
    const result = computeAnnualReport({
      subjects: [
        subject("math", [scored("e1", "80", "100"), mark("e2", "NOT_APPLICABLE")]),
      ],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(result.subjects[0]!.percentage).toBe("80.00")
    expect(result.subjects[0]!.excludedExamIds).toEqual(["e2"])
    expect(result.subjects[0]!.includedExamIds).toEqual(["e1"])
  })

  it("blocks a subject on a PENDING mark", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80"), mark("e2", "PENDING")])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(result.subjects[0]!.outcome).toBe("REQUIRES_REVIEW")
    expect(result.subjects[0]!.reason).toBe("PENDING_OR_MISSING_MARKS")
    expect(result.overallResult).toBe("REQUIRES_REVIEW")
  })

  it("blocks an empty marks array as missing data, never as all-NOT_APPLICABLE", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(result.subjects[0]!.outcome).toBe("REQUIRES_REVIEW")
    expect(result.subjects[0]!.reason).toBe("PENDING_OR_MISSING_MARKS")
    expect(result.subjects[0]!.percentage).toBeNull()
    expect(result.subjects[0]!.outcome).not.toBe("NOT_APPLICABLE")
    expect(result.overallResult).toBe("REQUIRES_REVIEW")
  })

  it("does not let an empty marks array improve the overall result", () => {
    // With a genuinely all-N/A subject the report would resolve to PASS; a
    // subject with NO mark rows is missing data and must block, so it can never
    // be excluded in a way that lets the report PASS.
    const withEmpty = computeAnnualReport({
      subjects: [subject("math", []), subject("sci", [scored("e1", "80")])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(withEmpty.subjects[0]!.outcome).toBe("REQUIRES_REVIEW")
    expect(withEmpty.overallResult).toBe("REQUIRES_REVIEW")
    expect(withEmpty.overallResult).not.toBe("PASS")
  })

  it("still excludes a genuinely all-NOT_APPLICABLE subject (explicit status)", () => {
    const result = computeAnnualReport({
      subjects: [
        subject("math", [mark("e1", "NOT_APPLICABLE"), mark("e2", "NOT_APPLICABLE")]),
      ],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(result.subjects[0]!.outcome).toBe("NOT_APPLICABLE")
    expect(result.subjects[0]!.reason).toBe("ALL_NOT_APPLICABLE")
    expect(result.resolvedSubjectCount).toBe(0)
    // An empty resolved set is UNRESOLVED, never PASS (§6 empty-set guard).
    expect(result.overallResult).toBe("UNRESOLVED")
  })

  it("resolves an all-absent subject under EXCLUDE_AND_REVIEW to review", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [mark("e1", "ABSENT"), mark("e2", "ABSENT")])],
      examWeights: {},
      policy: basePolicy({ absencePolicy: "EXCLUDE_AND_REVIEW" }),
    })
    expect(result.subjects[0]!.outcome).toBe("REQUIRES_REVIEW")
    expect(result.subjects[0]!.reason).toBe("ABSENT_EXCLUDED_REVIEW")
    expect(result.subjects[0]!.percentage).toBeNull()
  })

  it("resolves an all-absent subject under TREAT_SUBJECT_AS_FAILED to FAIL with null %", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [mark("e1", "ABSENT"), mark("e2", "ABSENT")])],
      examWeights: {},
      policy: basePolicy({ absencePolicy: "TREAT_SUBJECT_AS_FAILED" }),
    })
    expect(result.subjects[0]!.outcome).toBe("FAIL")
    expect(result.subjects[0]!.percentage).toBeNull()
    expect(result.subjects[0]!.reason).toBe("ABSENT_FORCED_FAIL")
  })

  it("weights exam-level subject percentages", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80"), scored("e2", "60")])],
      examWeights: { e1: "0.5", e2: "0.5" },
      policy: basePolicy({ aggregationPolicy: "PERCENTAGE_WEIGHTED" }),
    })
    expect(result.subjects[0]!.percentage).toBe("70.00")
  })

  it("renormalises weights per subject when an exam is excluded", () => {
    const result = computeAnnualReport({
      subjects: [
        subject("math", [scored("e1", "80"), mark("e2", "NOT_APPLICABLE")]),
      ],
      examWeights: { e1: "0.5", e2: "0.5" },
      policy: basePolicy({ aggregationPolicy: "PERCENTAGE_WEIGHTED" }),
    })
    expect(result.subjects[0]!.percentage).toBe("80.00")
  })

  it("assigns a grade from the grading bands", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "85")])],
      examWeights: {},
      policy: basePolicy({
        gradingBands: [{ minPercent: 80, maxPercent: 89, grade: "A" }],
      }),
    })
    expect(result.subjects[0]!.grade).toBe("A")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// §5 — overall percentage
// ────────────────────────────────────────────────────────────────────────────

describe("overall percentage (spec §5)", () => {
  it("pools RAW across resolved subjects' scored marks", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")]), subject("sci", [scored("e2", "40")])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(result.overallPercentage).toBe("60.00")
  })

  it("takes the unweighted mean of subject percentages for WEIGHTED", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")]), subject("sci", [scored("e2", "60")])],
      examWeights: { e1: "0.5", e2: "0.5" },
      policy: basePolicy({ aggregationPolicy: "PERCENTAGE_WEIGHTED" }),
    })
    expect(result.overallPercentage).toBe("70.00")
  })

  it("rounds the overall RAW percentage exactly (89.995 → 90.00)", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "89995", "100000")])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(result.overallPercentage).toBe("90.00")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// §6 — overall result modes and empty-set guard
// ────────────────────────────────────────────────────────────────────────────

describe("overall result modes (spec §6)", () => {
  it("ALL_SUBJECTS passes only when every resolved subject passes", () => {
    const pass = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")]), subject("sci", [scored("e2", "70")])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(pass.overallResult).toBe("PASS")

    const fail = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")]), subject("sci", [scored("e2", "30")])],
      examWeights: {},
      policy: basePolicy(),
    })
    expect(fail.overallResult).toBe("FAIL")
    expect(fail.failedCount).toBe(1)
  })

  it("PERCENT_AND_MAX_FAILED allows failures within the cap and above the threshold", () => {
    const result = computeAnnualReport({
      subjects: [
        subject("math", [scored("e1", "30")]),
        subject("sci", [scored("e2", "70")]),
        subject("eng", [scored("e3", "80")]),
      ],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "PERCENT_AND_MAX_FAILED",
        overallPassPercent: "50",
        maxFailedSubjects: 1,
      }),
    })
    expect(result.failedCount).toBe(1)
    expect(result.overallResult).toBe("PASS")
  })

  it("PERCENT_AND_MAX_FAILED fails when failures exceed the cap", () => {
    const result = computeAnnualReport({
      subjects: [
        subject("math", [scored("e1", "30")]),
        subject("sci", [scored("e2", "20")]),
        subject("eng", [scored("e3", "80")]),
      ],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "PERCENT_AND_MAX_FAILED",
        overallPassPercent: "50",
        maxFailedSubjects: 1,
      }),
    })
    expect(result.failedCount).toBe(2)
    expect(result.overallResult).toBe("FAIL")
  })

  it("PERCENT_AND_MAX_FAILED fails below the overall threshold", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "60")]), subject("sci", [scored("e2", "70")])],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "PERCENT_AND_MAX_FAILED",
        overallPassPercent: "90",
        maxFailedSubjects: 1,
      }),
    })
    expect(result.failedCount).toBe(0)
    expect(result.overallResult).toBe("FAIL")
  })

  it("CORE_SUBJECTS_AND_PERCENT requires the core subject and the threshold", () => {
    const pass = computeAnnualReport({
      subjects: [
        subject("math", [scored("e1", "60")], true),
        subject("sci", [scored("e2", "80")]),
      ],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
        overallPassPercent: "50",
        coreSubjectIds: ["math"],
      }),
    })
    expect(pass.overallResult).toBe("PASS")

    const coreFail = computeAnnualReport({
      subjects: [
        subject("math", [scored("e1", "30")], true),
        subject("sci", [scored("e2", "90")]),
      ],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
        overallPassPercent: "50",
        coreSubjectIds: ["math"],
      }),
    })
    expect(coreFail.overallResult).toBe("FAIL")

    const belowThreshold = computeAnnualReport({
      subjects: [
        subject("math", [scored("e1", "60")], true),
        subject("sci", [scored("e2", "60")]),
      ],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
        overallPassPercent: "80",
        coreSubjectIds: ["math"],
      }),
    })
    expect(belowThreshold.overallResult).toBe("FAIL")
  })

  it("never silently removes a core subject marked NOT_APPLICABLE", () => {
    const result = computeAnnualReport({
      subjects: [
        subject("math", [mark("e1", "NOT_APPLICABLE")], true),
        subject("sci", [scored("e2", "90")]),
      ],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
        overallPassPercent: "50",
        coreSubjectIds: ["math"],
      }),
    })
    expect(result.overallResult).toBe("REQUIRES_REVIEW")
    expect(result.overallResult).not.toBe("PASS")
  })

  it("empty resolved set is UNRESOLVED and never PASS, for every mode", () => {
    for (const mode of ["ALL_SUBJECTS", "PERCENT_AND_MAX_FAILED", "CORE_SUBJECTS_AND_PERCENT"] as const) {
      const result = computeAnnualReport({
        subjects: [subject("math", [mark("e1", "NOT_APPLICABLE")])],
        examWeights: {},
        policy: basePolicy({
          overallPassMode: mode,
          overallPassPercent: "0",
          maxFailedSubjects: 0,
          coreSubjectIds: [],
        }),
      })
      // CORE with empty coreSubjectIds is a config error and blocks; that is
      // also never a PASS. The other modes are UNRESOLVED.
      expect(result.overallResult).not.toBe("PASS")
    }
  })

  it("forced-fail with a null percentage follows the §6 table", () => {
    const forced = subject("math", [mark("e1", "ABSENT")])

    const allSubjects = computeAnnualReport({
      subjects: [forced, subject("sci", [scored("e2", "80")])],
      examWeights: {},
      policy: basePolicy({ absencePolicy: "TREAT_SUBJECT_AS_FAILED" }),
    })
    // The forced-fail subject contributes no numeric value, but the scored
    // subject still resolves the overall percentage. A forced fail resolves the
    // ALL_SUBJECTS result to FAIL regardless of the percentage.
    expect(allSubjects.overallPercentage).toBe("80.00")
    expect(allSubjects.failedCount).toBe(1)
    expect(allSubjects.overallResult).toBe("FAIL")

    // When NO resolved subject has a numeric percentage, the overall percentage
    // is genuinely null (UNRESOLVED unless the failed count forces FAIL).
    const noNumeric = computeAnnualReport({
      subjects: [subject("math", [mark("e1", "ABSENT")])],
      examWeights: {},
      policy: basePolicy({
        absencePolicy: "TREAT_SUBJECT_AS_FAILED",
        overallPassMode: "PERCENT_AND_MAX_FAILED",
        overallPassPercent: "50",
        maxFailedSubjects: 0,
      }),
    })
    expect(noNumeric.overallPercentage).toBeNull()
    // failedCount (1) > maxFailedSubjects (0) forces FAIL.
    expect(noNumeric.overallResult).toBe("FAIL")

    const percentCap = computeAnnualReport({
      subjects: [forced, subject("sci", [scored("e2", "80")]), subject("eng", [scored("e3", "80")])],
      examWeights: {},
      policy: basePolicy({
        absencePolicy: "TREAT_SUBJECT_AS_FAILED",
        overallPassMode: "PERCENT_AND_MAX_FAILED",
        overallPassPercent: "50",
        maxFailedSubjects: 1,
      }),
    })
    expect(percentCap.failedCount).toBe(1)
    expect(percentCap.overallResult).toBe("PASS")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// §7 — required configuration blocks publication (never invented)
// ────────────────────────────────────────────────────────────────────────────

describe("required configuration (spec §7)", () => {
  it("blocks when annualSubjectPassPercent is missing or corrupt", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")])],
      examWeights: {},
      policy: basePolicy({ annualSubjectPassPercent: "not-a-number" }),
    })
    expect(result.configurationErrors.length).toBeGreaterThan(0)
    expect(result.overallResult).toBe("REQUIRES_REVIEW")
  })

  it("blocks weighted aggregation without valid weights", () => {
    const missing = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")])],
      examWeights: {},
      policy: basePolicy({ aggregationPolicy: "PERCENTAGE_WEIGHTED" }),
    })
    expect(missing.configurationErrors.length).toBeGreaterThan(0)

    const badSum = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")])],
      examWeights: { e1: "0.8" },
      policy: basePolicy({ aggregationPolicy: "PERCENTAGE_WEIGHTED" }),
    })
    expect(badSum.configurationErrors.length).toBeGreaterThan(0)
    expect(badSum.overallResult).toBe("REQUIRES_REVIEW")
  })

  it("blocks PERCENT_AND_MAX_FAILED when maxFailedSubjects is not < resolved subject count", () => {
    const result = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")])],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "PERCENT_AND_MAX_FAILED",
        overallPassPercent: "50",
        maxFailedSubjects: 1,
      }),
    })
    expect(result.resolvedSubjectCount).toBe(1)
    expect(result.configurationErrors.length).toBeGreaterThan(0)
  })

  it("blocks CORE_SUBJECTS_AND_PERCENT with empty or unknown core subjects", () => {
    const empty = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")])],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
        overallPassPercent: "50",
        coreSubjectIds: [],
      }),
    })
    expect(empty.configurationErrors.length).toBeGreaterThan(0)

    const unknown = computeAnnualReport({
      subjects: [subject("math", [scored("e1", "80")])],
      examWeights: {},
      policy: basePolicy({
        overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
        overallPassPercent: "50",
        coreSubjectIds: ["ghost"],
      }),
    })
    expect(unknown.configurationErrors.length).toBeGreaterThan(0)
    expect(unknown.overallResult).toBe("REQUIRES_REVIEW")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// §4 — mark status entry rules and schema
// ────────────────────────────────────────────────────────────────────────────

describe("mark status entry rules (spec §4)", () => {
  it("rejects NOT_APPLICABLE on a core subject at entry", () => {
    let caught: unknown
    try {
      assertMarkStatusEntryAllowed({ isCoreSubject: true, status: "NOT_APPLICABLE" })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).statusCode).toBe(400)
  })

  it("allows NOT_APPLICABLE on a non-core subject and any status on a core subject", () => {
    expect(() =>
      assertMarkStatusEntryAllowed({ isCoreSubject: false, status: "NOT_APPLICABLE" }),
    ).not.toThrow()
    expect(() =>
      assertMarkStatusEntryAllowed({ isCoreSubject: true, status: "SCORED" }),
    ).not.toThrow()
  })

  it("accepts the four mark statuses and rejects unknown ones", () => {
    expect(markStatusSchema.safeParse("ABSENT").success).toBe(true)
    expect(markStatusSchema.safeParse("EXCUSED").success).toBe(false)
  })

  it("rejects a non-positive exam weight", () => {
    expect(examWeightSchema.safeParse("0.5").success).toBe(true)
    expect(examWeightSchema.safeParse("0").success).toBe(false)
    expect(examWeightSchema.safeParse("-0.2").success).toBe(false)
  })
})
