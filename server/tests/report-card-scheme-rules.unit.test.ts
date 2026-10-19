// Pure, database-free tests for Report Card scheme configuration rules
// (docs/report-card.md §2, §4, §5, §7; M6a).
//
// These cover the request-shaping gate (`normalizeSchemeInput`) and the schema
// contract: server-derived scopeKey, decimal normalization, percent bounds, the
// conditional requirements of each overallPassMode, duplicate rejection, and
// the shared weight validation reused from the report-card engine. Nothing here
// touches a database.

import { describe, expect, it } from "vitest"
import { ApiError } from "../src/lib/ApiError.js"
import { upsertReportCardSchemeSchema } from "../src/modules/report-card-schemes/report-card-scheme.schema.js"
import {
  CLASS_SCOPE_KEY,
  deriveScopeKey,
  normalizeDecimal,
  normalizeSchemeInput,
} from "../src/modules/report-card-schemes/report-card-scheme.rules.js"

const SESSION = "00000000-0000-4000-8000-0000000000b1"
const CLASS = "00000000-0000-4000-8000-0000000000c1"
const SECTION = "00000000-0000-4000-8000-0000000000c2"
const TYPE_1 = "00000000-0000-4000-8000-0000000000f1"
const TYPE_2 = "00000000-0000-4000-8000-0000000000f2"
const SUBJECT_1 = "00000000-0000-4000-8000-0000000020f1"

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    academicSessionId: SESSION,
    classId: CLASS,
    aggregationPolicy: "RAW",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "ALL_SUBJECTS",
    annualSubjectPassPercent: 40,
    coreSubjectIds: [],
    exams: [{ examTypeId: TYPE_1 }],
    ...overrides,
  }
}

function parse(overrides: Record<string, unknown> = {}): ReturnType<typeof normalizeSchemeInput> {
  const parsed = upsertReportCardSchemeSchema.safeParse(body(overrides))
  if (!parsed.success) throw parsed.error
  return normalizeSchemeInput(parsed.data)
}

function expectApiError(fn: () => unknown, messagePart: string): void {
  try {
    fn()
    throw new Error("Expected an ApiError to be thrown")
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain(messagePart)
  }
}

describe("deriveScopeKey (M6a)", () => {
  it("maps a null section to the class-level scope key", () => {
    expect(deriveScopeKey(null)).toBe(CLASS_SCOPE_KEY)
    expect(CLASS_SCOPE_KEY).toBe("__CLASS__")
  })

  it("maps a section to that section id", () => {
    expect(deriveScopeKey(SECTION)).toBe(SECTION)
  })
})

describe("normalizeDecimal (M6a)", () => {
  it("passes through an exact decimal string", () => {
    expect(normalizeDecimal("0.6", "weight")).toBe("0.6")
    expect(normalizeDecimal("95.25", "pct")).toBe("95.25")
  })

  it("accepts a plain number without float noise", () => {
    expect(normalizeDecimal(0.6, "weight")).toBe("0.6")
    expect(normalizeDecimal(40, "pct")).toBe("40")
  })

  it("rejects a non-decimal string", () => {
    expectApiError(() => normalizeDecimal("abc", "weight"), "exact decimal")
    expectApiError(() => normalizeDecimal("1e3", "weight"), "exact decimal")
    expectApiError(() => normalizeDecimal("NaN", "weight"), "exact decimal")
  })

  it("rejects a non-finite number", () => {
    expectApiError(() => normalizeDecimal(Number.POSITIVE_INFINITY, "weight"), "finite")
  })
})

describe("normalizeSchemeInput — scopeKey (M6a)", () => {
  it("derives the class scope key when no section is supplied", () => {
    expect(parse().scopeKey).toBe(CLASS_SCOPE_KEY)
    expect(parse().sectionId).toBeNull()
  })

  it("derives the section scope key when a section is supplied", () => {
    const scheme = parse({ sectionId: SECTION })
    expect(scheme.sectionId).toBe(SECTION)
    expect(scheme.scopeKey).toBe(SECTION)
  })
})

describe("normalizeSchemeInput — decimal + percent normalization (M6a)", () => {
  it("normalizes a number percentage to a decimal string", () => {
    expect(parse({ annualSubjectPassPercent: 40 }).annualSubjectPassPercent).toBe("40")
  })

  it("normalizes a string percentage to an exact decimal string", () => {
    expect(parse({ annualSubjectPassPercent: "62.5" }).annualSubjectPassPercent).toBe("62.5")
  })

  it("bounds annualSubjectPassPercent to 0–100", () => {
    expectApiError(() => parse({ annualSubjectPassPercent: 101 }), "between 0 and 100")
    expectApiError(() => parse({ annualSubjectPassPercent: -1 }), "between 0 and 100")
  })
})

describe("normalizeSchemeInput — overallPassMode conditional requirements (M6a)", () => {
  it("rejects overallPassPercent under ALL_SUBJECTS", () => {
    expectApiError(() => parse({ overallPassPercent: 50 }), "must be omitted for ALL_SUBJECTS")
  })

  it("rejects maxFailedSubjects under ALL_SUBJECTS", () => {
    expectApiError(() => parse({ maxFailedSubjects: 1 }), "must be omitted for ALL_SUBJECTS")
  })

  it("rejects coreSubjectIds under ALL_SUBJECTS", () => {
    expectApiError(
      () => parse({ coreSubjectIds: [SUBJECT_1] }),
      "coreSubjectIds must be omitted for ALL_SUBJECTS",
    )
  })

  it("accepts the documented default (ALL_SUBJECTS, no extras)", () => {
    const scheme = parse()
    expect(scheme.overallPassPercent).toBeNull()
    expect(scheme.maxFailedSubjects).toBeNull()
    expect(scheme.coreSubjectIds).toEqual([])
  })

  it("requires both percent and maxFailed under PERCENT_AND_MAX_FAILED", () => {
    expectApiError(
      () => parse({ overallPassMode: "PERCENT_AND_MAX_FAILED" }),
      "overallPassPercent is required",
    )
    expectApiError(
      () => parse({ overallPassMode: "PERCENT_AND_MAX_FAILED", overallPassPercent: 50 }),
      "maxFailedSubjects is required",
    )
    expectApiError(
      () =>
        parse({
          overallPassMode: "PERCENT_AND_MAX_FAILED",
          overallPassPercent: 50,
          maxFailedSubjects: 2,
          coreSubjectIds: [SUBJECT_1],
        }),
      "coreSubjectIds must be omitted for PERCENT_AND_MAX_FAILED",
    )
  })

  it("accepts a complete PERCENT_AND_MAX_FAILED configuration", () => {
    const scheme = parse({
      overallPassMode: "PERCENT_AND_MAX_FAILED",
      overallPassPercent: "50",
      maxFailedSubjects: 1,
    })
    expect(scheme.overallPassPercent).toBe("50")
    expect(scheme.maxFailedSubjects).toBe(1)
    expect(scheme.coreSubjectIds).toEqual([])
  })

  it("requires percent and cores under CORE_SUBJECTS_AND_PERCENT", () => {
    expectApiError(
      () => parse({ overallPassMode: "CORE_SUBJECTS_AND_PERCENT", coreSubjectIds: [SUBJECT_1] }),
      "overallPassPercent is required",
    )
    expectApiError(
      () =>
        parse({ overallPassMode: "CORE_SUBJECTS_AND_PERCENT", overallPassPercent: 50 }),
      "coreSubjectIds is required",
    )
    expectApiError(
      () =>
        parse({
          overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
          overallPassPercent: 50,
          maxFailedSubjects: 1,
          coreSubjectIds: [SUBJECT_1],
        }),
      "maxFailedSubjects must be omitted for CORE_SUBJECTS_AND_PERCENT",
    )
  })

  it("accepts a complete CORE_SUBJECTS_AND_PERCENT configuration", () => {
    const scheme = parse({
      overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
      overallPassPercent: "55",
      coreSubjectIds: [SUBJECT_1],
    })
    expect(scheme.overallPassPercent).toBe("55")
    expect(scheme.coreSubjectIds).toEqual([SUBJECT_1])
  })
})

describe("normalizeSchemeInput — duplicate rejection (M6a)", () => {
  it("rejects duplicate exam types", () => {
    expectApiError(
      () => parse({ exams: [{ examTypeId: TYPE_1 }, { examTypeId: TYPE_1 }] }),
      "only reference an exam type once",
    )
  })

  it("rejects duplicate core subjects", () => {
    expectApiError(
      () =>
        parse({
          overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
          overallPassPercent: 50,
          coreSubjectIds: [SUBJECT_1, SUBJECT_1],
        }),
      "must not contain duplicates",
    )
  })
})

describe("normalizeSchemeInput — RAW aggregation (M6a)", () => {
  it("pins weights to 0 and does not run the weight-sum rule", () => {
    const scheme = parse({ exams: [{ examTypeId: TYPE_1 }, { examTypeId: TYPE_2 }] })
    expect(scheme.exams.map((exam) => exam.weight)).toEqual(["0", "0"])
  })

  it("still normalizes a supplied weight without enforcing the sum", () => {
    const scheme = parse({ exams: [{ examTypeId: TYPE_1, weight: "0.6" }, { examTypeId: TYPE_2 }] })
    expect(scheme.exams.map((exam) => exam.weight)).toEqual(["0.6", "0"])
  })

  it("defaults sortOrder to the array index", () => {
    const scheme = parse({ exams: [{ examTypeId: TYPE_1 }, { examTypeId: TYPE_2 }] })
    expect(scheme.exams.map((exam) => exam.sortOrder)).toEqual([0, 1])
  })
})

describe("normalizeSchemeInput — PERCENTAGE_WEIGHTED aggregation (M6a)", () => {
  it("requires a weight on every exam", () => {
    expectApiError(
      () =>
        parse({
          aggregationPolicy: "PERCENTAGE_WEIGHTED",
          exams: [{ examTypeId: TYPE_1, weight: "0.5" }, { examTypeId: TYPE_2 }],
        }),
      "requires a weight",
    )
  })

  it("accepts weights that sum to 1", () => {
    const scheme = parse({
      aggregationPolicy: "PERCENTAGE_WEIGHTED",
      exams: [
        { examTypeId: TYPE_1, weight: "0.6" },
        { examTypeId: TYPE_2, weight: "0.4" },
      ],
    })
    expect(scheme.exams.map((exam) => exam.weight)).toEqual(["0.6", "0.4"])
  })

  it("rejects weights that do not sum to 1 (reusing the shared rule)", () => {
    expectApiError(
      () =>
        parse({
          aggregationPolicy: "PERCENTAGE_WEIGHTED",
          exams: [
            { examTypeId: TYPE_1, weight: "0.7" },
            { examTypeId: TYPE_2, weight: "0.4" },
          ],
        }),
      "must sum to 1",
    )
  })

  it("rejects a non-positive weight", () => {
    expectApiError(
      () =>
        parse({
          aggregationPolicy: "PERCENTAGE_WEIGHTED",
          exams: [
            { examTypeId: TYPE_1, weight: "1" },
            { examTypeId: TYPE_2, weight: "0" },
          ],
        }),
      "strictly positive",
    )
  })

  it("tolerates the documented 1 ± 0.0001 weight-sum tolerance", () => {
    const scheme = parse({
      aggregationPolicy: "PERCENTAGE_WEIGHTED",
      exams: [
        { examTypeId: TYPE_1, weight: "0.6" },
        { examTypeId: TYPE_2, weight: "0.40005" },
      ],
    })
    expect(scheme.exams.map((exam) => exam.weight)).toEqual(["0.6", "0.40005"])
  })
})

describe("upsertReportCardSchemeSchema — strict validation (M6a)", () => {
  it("applies documented defaults for absencePolicy / publicationMode", () => {
    const parsed = upsertReportCardSchemeSchema.parse(body())
    expect(parsed.absencePolicy).toBe("EXCLUDE_AND_REVIEW")
    expect(parsed.publicationMode).toBe("REQUIRE_DECISION")
    expect(parsed.coreSubjectIds).toEqual([])
  })

  it("rejects unknown top-level fields", () => {
    const result = upsertReportCardSchemeSchema.safeParse(body({ schoolId: "nope" }))
    expect(result.success).toBe(false)
  })

  it("rejects unknown fields inside an exam entry", () => {
    const result = upsertReportCardSchemeSchema.safeParse(
      body({ exams: [{ examTypeId: TYPE_1, weight: "0.5", bogus: 1 }] }),
    )
    expect(result.success).toBe(false)
  })

  it("rejects an empty exam list", () => {
    expect(upsertReportCardSchemeSchema.safeParse(body({ exams: [] })).success).toBe(false)
  })

  it("rejects a non-UUID id", () => {
    expect(upsertReportCardSchemeSchema.safeParse(body({ classId: "not-a-uuid" })).success).toBe(
      false,
    )
  })

  it("rejects an unknown aggregationPolicy", () => {
    expect(
      upsertReportCardSchemeSchema.safeParse(body({ aggregationPolicy: "SOMETHING" })).success,
    ).toBe(false)
  })

  it("rejects an unknown publicationMode", () => {
    expect(upsertReportCardSchemeSchema.safeParse(body({ publicationMode: "AUTO" })).success).toBe(
      false,
    )
  })
})
