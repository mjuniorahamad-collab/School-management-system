// Pure policy rules for Report Card scheme configuration
// (docs/report-card.md §2, §4, §5, §7; M6a).
//
// No database, no HTTP: every function here is deterministic and unit-testable.
// `normalizeSchemeInput` is the single gate that turns a validated request body
// into the exact, normalized shape the service persists. It:
//   - derives the canonical `scopeKey` server-side (never trusts the client),
//   - normalizes decimals to exact decimal strings (number | string -> string),
//   - enforces percent bounds,
//   - enforces the conditional requirements of each `overallPassMode`,
//   - rejects duplicate exam types / core subjects,
//   - validates exam weights against the shared `validateExamWeights` rule for
//     PERCENTAGE_WEIGHTED aggregation, and pins RAW weights to "0" (the column is
//     NOT NULL and weights are meaningless under RAW).

import { badRequestError } from "../../lib/ApiError.js"
import { parseDecimal, validateExamWeights } from "../report-cards/report-card.rounding.js"
import type {
  AbsencePolicy,
  AggregationPolicy,
  OverallPassMode,
} from "../report-cards/report-card.types.js"
import type { UpsertReportCardSchemeInput } from "./report-card-scheme.schema.js"
import type { ReportCardPublicationMode } from "./report-card-scheme.types.js"

/** `scopeKey` used when a scheme targets a whole class (no section). */
export const CLASS_SCOPE_KEY = "__CLASS__"

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/
const ZERO_WEIGHT = "0"

export function deriveScopeKey(sectionId: string | null): string {
  return sectionId ?? CLASS_SCOPE_KEY
}

/**
 * Normalizes a client decimal (`number` or exact `string`) to an exact decimal
 * string. Numbers in exponent form are expanded to fixed notation so the value
 * stored in a DECIMAL column never depends on binary-float formatting.
 */
export function normalizeDecimal(input: number | string, field: string): string {
  if (typeof input === "string") {
    const trimmed = input.trim()
    if (!DECIMAL_PATTERN.test(trimmed)) {
      throw badRequestError(`${field} must be an exact decimal value`)
    }
    return trimmed
  }
  if (!Number.isFinite(input)) {
    throw badRequestError(`${field} must be a finite number`)
  }
  const asString = input.toString()
  if (DECIMAL_PATTERN.test(asString)) return asString
  const fixed = input.toFixed(10)
  if (!DECIMAL_PATTERN.test(fixed)) {
    throw badRequestError(`${field} must be an exact decimal value`)
  }
  return fixed
}

function normalizePercent(input: number | string, field: string): string {
  const value = normalizeDecimal(input, field)
  const numeric = Number(value)
  if (numeric < 0 || numeric > 100) {
    throw badRequestError(`${field} must be between 0 and 100`)
  }
  return value
}

export interface NormalizedSchemeExam {
  examTypeId: string
  weight: string
  sortOrder: number
}

export interface NormalizedScheme {
  academicSessionId: string
  classId: string
  sectionId: string | null
  scopeKey: string
  aggregationPolicy: AggregationPolicy
  absencePolicy: AbsencePolicy
  overallPassMode: OverallPassMode
  annualSubjectPassPercent: string
  overallPassPercent: string | null
  maxFailedSubjects: number | null
  coreSubjectIds: string[]
  publicationMode: ReportCardPublicationMode
  exams: NormalizedSchemeExam[]
}

function assertOverallPassModeConfig(input: UpsertReportCardSchemeInput): void {
  const percent = input.overallPassPercent
  const maxFailed = input.maxFailedSubjects
  const core = input.coreSubjectIds

  switch (input.overallPassMode) {
    case "ALL_SUBJECTS":
      if (percent !== null && percent !== undefined) {
        throw badRequestError("overallPassPercent must be omitted for ALL_SUBJECTS")
      }
      if (maxFailed !== null && maxFailed !== undefined) {
        throw badRequestError("maxFailedSubjects must be omitted for ALL_SUBJECTS")
      }
      if (core.length > 0) {
        throw badRequestError("coreSubjectIds must be omitted for ALL_SUBJECTS")
      }
      return
    case "PERCENT_AND_MAX_FAILED":
      if (percent === null || percent === undefined) {
        throw badRequestError("overallPassPercent is required for PERCENT_AND_MAX_FAILED")
      }
      if (maxFailed === null || maxFailed === undefined) {
        throw badRequestError("maxFailedSubjects is required for PERCENT_AND_MAX_FAILED")
      }
      if (core.length > 0) {
        throw badRequestError("coreSubjectIds must be omitted for PERCENT_AND_MAX_FAILED")
      }
      return
    case "CORE_SUBJECTS_AND_PERCENT":
      if (percent === null || percent === undefined) {
        throw badRequestError("overallPassPercent is required for CORE_SUBJECTS_AND_PERCENT")
      }
      if (maxFailed !== null && maxFailed !== undefined) {
        throw badRequestError("maxFailedSubjects must be omitted for CORE_SUBJECTS_AND_PERCENT")
      }
      if (core.length === 0) {
        throw badRequestError("coreSubjectIds is required for CORE_SUBJECTS_AND_PERCENT")
      }
      return
  }
}

export function normalizeSchemeInput(input: UpsertReportCardSchemeInput): NormalizedScheme {
  const sectionId = input.sectionId ?? null
  const scopeKey = deriveScopeKey(sectionId)

  assertOverallPassModeConfig(input)

  const coreSubjectIds = input.coreSubjectIds
  if (new Set(coreSubjectIds).size !== coreSubjectIds.length) {
    throw badRequestError("coreSubjectIds must not contain duplicates")
  }

  const examTypeIds = input.exams.map((exam) => exam.examTypeId)
  if (new Set(examTypeIds).size !== examTypeIds.length) {
    throw badRequestError("A scheme exam may only reference an exam type once")
  }

  const exams: NormalizedSchemeExam[] = input.exams.map((exam, index) => {
    let weight = ZERO_WEIGHT
    if (input.aggregationPolicy === "PERCENTAGE_WEIGHTED") {
      if (exam.weight === undefined) {
        throw badRequestError(
          "Every scheme exam requires a weight for PERCENTAGE_WEIGHTED aggregation",
        )
      }
      weight = normalizeDecimal(exam.weight, "weight")
    } else if (exam.weight !== undefined) {
      weight = normalizeDecimal(exam.weight, "weight")
    }
    return { examTypeId: exam.examTypeId, weight, sortOrder: exam.sortOrder ?? index }
  })

  if (input.aggregationPolicy === "PERCENTAGE_WEIGHTED") {
    const reason = validateExamWeights(exams.map((exam) => parseDecimal(exam.weight)))
    if (reason) throw badRequestError(reason)
  }

  return {
    academicSessionId: input.academicSessionId,
    classId: input.classId,
    sectionId,
    scopeKey,
    aggregationPolicy: input.aggregationPolicy,
    absencePolicy: input.absencePolicy,
    overallPassMode: input.overallPassMode,
    annualSubjectPassPercent: normalizePercent(
      input.annualSubjectPassPercent,
      "annualSubjectPassPercent",
    ),
    overallPassPercent:
      input.overallPassPercent === null || input.overallPassPercent === undefined
        ? null
        : normalizePercent(input.overallPassPercent, "overallPassPercent"),
    maxFailedSubjects: input.maxFailedSubjects ?? null,
    coreSubjectIds,
    publicationMode: input.publicationMode,
    exams,
  }
}
