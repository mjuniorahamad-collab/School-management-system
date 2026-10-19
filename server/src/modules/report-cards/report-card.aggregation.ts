// Annual aggregation and outcome engine for the Report Card (docs/report-card.md
// §5, §6).
//
// Pure and database-free: it consumes plain value objects and returns the frozen
// annual values. It never fetches, never infers a missing mark, and never
// substitutes an invented pass percentage — missing or corrupt required
// configuration is surfaced as a configuration error and blocks ($7).

import { gradeForPercentage } from "../results/grading.js"
import {
  addRational,
  compareRational,
  divRational,
  makeRational,
  mulRational,
  parseDecimal,
  rationalToNumber,
  roundHalfUp,
  toFixedDecimal,
  validateExamWeights,
  type Rational,
} from "./report-card.rounding.js"
import type {
  AnnualComputationInput,
  AnnualComputationResult,
  AnnualPolicyInput,
  AnnualResult,
  AnnualSubjectInput,
  OverallPassMode,
  SubjectAnnualResult,
  SubjectOutcomeReason,
} from "./report-card.types.js"

const HUNDRED = parseDecimal("100")

function zero(): Rational {
  return { n: 0n, d: 1n }
}

/** A scored mark with its non-null obtained value narrowed. */
interface ScoredMark {
  examId: string
  obtainedMarks: string
  maxMarks: string
}

type SubjectPercentage = { kind: "value"; value: Rational } | { kind: "error" }

/**
 * Subject annual percentage (docs/report-card.md §5).
 *
 * `RAW` pools across exams (`Σ obtained / Σ max`); `PERCENTAGE_WEIGHTED` is the
 * weighted average of exam-level subject percentages with per-subject
 * renormalisation over the exams that contributed.
 */
function computeSubjectPercentage(
  scored: readonly ScoredMark[],
  policy: AnnualPolicyInput,
  weights: Record<string, Rational>,
): SubjectPercentage {
  if (policy.aggregationPolicy === "RAW") {
    let obtained = zero()
    let max = zero()
    for (const mark of scored) {
      obtained = addRational(obtained, parseDecimal(mark.obtainedMarks))
      max = addRational(max, parseDecimal(mark.maxMarks))
    }
    if (max.n === 0n) return { kind: "error" }
    return { kind: "value", value: mulRational(divRational(obtained, max), HUNDRED) }
  }

  let numerator = zero()
  let denominator = zero()
  for (const mark of scored) {
    const weight = weights[mark.examId]
    if (weight === undefined) return { kind: "error" }
    const max = parseDecimal(mark.maxMarks)
    if (max.n === 0n) return { kind: "error" }
    const examPercentage = mulRational(divRational(parseDecimal(mark.obtainedMarks), max), HUNDRED)
    numerator = addRational(numerator, mulRational(weight, examPercentage))
    denominator = addRational(denominator, weight)
  }
  if (denominator.n === 0n) return { kind: "error" }
  return { kind: "value", value: divRational(numerator, denominator) }
}

/** Computes one subject's frozen annual outcome (docs/report-card.md §4, §6). */
function computeSubject(
  subject: AnnualSubjectInput,
  policy: AnnualPolicyInput,
  subjectPassPercent: Rational | null,
  weights: Record<string, Rational>,
): SubjectAnnualResult {
  const excludedExamIds: string[] = []
  const absentExamIds: string[] = []
  const includedExamIds: string[] = []
  const scored: ScoredMark[] = []
  let hasPendingOrMissing = false

  for (const mark of subject.marks) {
    if (mark.status === "NOT_APPLICABLE") {
      excludedExamIds.push(mark.examId)
    } else if (mark.status === "ABSENT") {
      absentExamIds.push(mark.examId)
    } else if (mark.status === "PENDING" || mark.obtainedMarks === null) {
      // A PENDING mark and a SCORED mark with no value are both missing data.
      hasPendingOrMissing = true
    } else {
      scored.push({ examId: mark.examId, obtainedMarks: mark.obtainedMarks, maxMarks: mark.maxMarks })
      includedExamIds.push(mark.examId)
    }
  }

  const base = {
    subjectId: subject.subjectId,
    isCore: subject.isCore,
    excludedExamIds,
    absentExamIds,
  }

  const unresolved = (reason: SubjectOutcomeReason): SubjectAnnualResult => ({
    ...base,
    includedExamIds: [],
    outcome: "REQUIRES_REVIEW",
    percentage: null,
    percentageValue: null,
    grade: null,
    reason,
  })

  // §4: a subject with no mark rows at all is missing data, not a genuine
  // all-NOT_APPLICABLE subject. Missing marks must block, never be silently
  // excluded (which could otherwise drop the subject from failedCount and the
  // overall mean and improve the result).
  if (subject.marks.length === 0) return unresolved("PENDING_OR_MISSING_MARKS")

  if (hasPendingOrMissing) return unresolved("PENDING_OR_MISSING_MARKS")

  if (scored.length === 0) {
    if (absentExamIds.length === 0) {
      // Every mark was explicitly N/A: excluded entirely.
      return {
        ...base,
        includedExamIds: [],
        outcome: "NOT_APPLICABLE",
        percentage: null,
        percentageValue: null,
        grade: null,
        reason: "ALL_NOT_APPLICABLE",
      }
    }
    if (policy.absencePolicy === "TREAT_SUBJECT_AS_FAILED") {
      return {
        ...base,
        includedExamIds: [],
        outcome: "FAIL",
        percentage: null,
        percentageValue: null,
        grade: null,
        reason: "ABSENT_FORCED_FAIL",
      }
    }
    return unresolved("ABSENT_EXCLUDED_REVIEW")
  }

  const percentage = computeSubjectPercentage(scored, policy, weights)
  if (percentage.kind === "error") return unresolved("WEIGHTS_UNAVAILABLE")
  if (subjectPassPercent === null) return unresolved("SUBJECT_PASS_PERCENT_UNAVAILABLE")

  const rounded = roundHalfUp(percentage.value)
  const percentageValue = rationalToNumber(rounded)
  const passed = compareRational(rounded, subjectPassPercent) >= 0
  return {
    ...base,
    includedExamIds,
    outcome: passed ? "PASS" : "FAIL",
    percentage: toFixedDecimal(rounded),
    percentageValue,
    grade: gradeForPercentage(percentageValue, policy.gradingBands),
    reason: null,
  }
}

/**
 * Overall percentage (docs/report-card.md §5).
 *
 * `RAW` pools `Σ obtained / Σ max` across the resolved subjects' scored marks.
 * `WEIGHTED` is the unweighted mean of the resolved subjects' annual
 * percentages; a forced-fail subject with a null percentage counts as failed but
 * contributes no numeric value.
 */
function computeOverallPercentage(
  results: readonly SubjectAnnualResult[],
  subjects: readonly AnnualSubjectInput[],
  policy: AnnualPolicyInput,
): Rational | null {
  const resolved = results.filter((result) => result.outcome === "PASS" || result.outcome === "FAIL")

  if (policy.aggregationPolicy === "RAW") {
    const subjectById = new Map(subjects.map((subject) => [subject.subjectId, subject]))
    let obtained = zero()
    let max = zero()
    for (const result of resolved) {
      const subject = subjectById.get(result.subjectId)
      if (!subject) continue
      for (const mark of subject.marks) {
        if (mark.status === "SCORED" && mark.obtainedMarks !== null) {
          obtained = addRational(obtained, parseDecimal(mark.obtainedMarks))
          max = addRational(max, parseDecimal(mark.maxMarks))
        }
      }
    }
    if (max.n === 0n) return null
    return roundHalfUp(mulRational(divRational(obtained, max), HUNDRED))
  }

  const numeric = resolved
    .map((result) => result.percentage)
    .filter((value): value is string => value !== null)
  if (numeric.length === 0) return null
  let sum = zero()
  for (const value of numeric) sum = addRational(sum, parseDecimal(value))
  return roundHalfUp(divRational(sum, makeRational(BigInt(numeric.length), 1n)))
}

interface OverallEvaluation {
  mode: OverallPassMode
  overallPercentage: Rational | null
  overallPassPercent: Rational | null
  maxFailedSubjects: number | null
  failedCount: number
  coreSubjectIds: readonly string[]
  results: readonly SubjectAnnualResult[]
}

/** Applies the configured overall pass mode (docs/report-card.md §6). */
function evaluateOverallMode(evaluation: OverallEvaluation): AnnualResult {
  switch (evaluation.mode) {
    case "ALL_SUBJECTS":
      return evaluation.failedCount > 0 ? "FAIL" : "PASS"
    case "PERCENT_AND_MAX_FAILED": {
      const maxFailed = evaluation.maxFailedSubjects ?? 0
      if (evaluation.failedCount > maxFailed) return "FAIL"
      if (evaluation.overallPercentage === null || evaluation.overallPassPercent === null) {
        return "UNRESOLVED"
      }
      return compareRational(evaluation.overallPercentage, evaluation.overallPassPercent) >= 0
        ? "PASS"
        : "FAIL"
    }
    case "CORE_SUBJECTS_AND_PERCENT": {
      const coreFailed = evaluation.coreSubjectIds.some(
        (id) => evaluation.results.find((result) => result.subjectId === id)?.outcome === "FAIL",
      )
      if (coreFailed) return "FAIL"
      if (evaluation.overallPercentage === null || evaluation.overallPassPercent === null) {
        return "UNRESOLVED"
      }
      return compareRational(evaluation.overallPercentage, evaluation.overallPassPercent) >= 0
        ? "PASS"
        : "FAIL"
    }
  }
}

/**
 * Computes the complete annual Report Card values for one student.
 *
 * Returns the frozen subject outcomes, the overall result, and every blocker or
 * configuration error. It never returns PASS on an empty resolved set and never
 * substitutes a pass percentage that was not configured.
 */
export function computeAnnualReport(input: AnnualComputationInput): AnnualComputationResult {
  const policy = input.policy
  const configurationErrors: string[] = []
  const blockers: string[] = []

  const weights: Record<string, Rational> = {}
  for (const [examId, raw] of Object.entries(input.examWeights)) {
    try {
      weights[examId] = parseDecimal(raw)
    } catch {
      configurationErrors.push(`Exam weight for ${examId} is not a valid decimal`)
    }
  }

  let subjectPassPercent: Rational | null = null
  try {
    subjectPassPercent = parseDecimal(policy.annualSubjectPassPercent)
  } catch {
    configurationErrors.push("annualSubjectPassPercent is missing or not a valid decimal")
  }

  let overallPassPercent: Rational | null = null
  if (policy.overallPassMode !== "ALL_SUBJECTS") {
    if (policy.overallPassPercent === null) {
      configurationErrors.push("overallPassPercent is required for the selected overall pass mode")
    } else {
      try {
        overallPassPercent = parseDecimal(policy.overallPassPercent)
      } catch {
        configurationErrors.push("overallPassPercent is not a valid decimal")
      }
    }
  }

  if (policy.aggregationPolicy === "PERCENTAGE_WEIGHTED") {
    const weightError = validateExamWeights(Object.values(weights))
    if (weightError) configurationErrors.push(weightError)
  }

  const results = input.subjects.map((subject) =>
    computeSubject(subject, policy, subjectPassPercent, weights),
  )

  const resolved = results.filter(
    (result) => result.outcome === "PASS" || result.outcome === "FAIL",
  )
  const resolvedSubjectCount = resolved.length
  const failedCount = results.filter((result) => result.outcome === "FAIL").length
  const anyRequiresReview = results.some((result) => result.outcome === "REQUIRES_REVIEW")

  if (policy.overallPassMode === "PERCENT_AND_MAX_FAILED") {
    if (policy.maxFailedSubjects === null) {
      configurationErrors.push("maxFailedSubjects is required for PERCENT_AND_MAX_FAILED")
    } else if (policy.maxFailedSubjects < 0) {
      configurationErrors.push("maxFailedSubjects must not be negative")
    } else if (policy.maxFailedSubjects >= resolvedSubjectCount) {
      configurationErrors.push(
        "maxFailedSubjects must be less than the number of resolved subjects",
      )
    }
  }

  let coreSubjectsUnresolved = false
  if (policy.overallPassMode === "CORE_SUBJECTS_AND_PERCENT") {
    if (policy.coreSubjectIds.length === 0) {
      configurationErrors.push("coreSubjectIds is required for CORE_SUBJECTS_AND_PERCENT")
    }
    for (const coreId of policy.coreSubjectIds) {
      const coreResult = results.find((result) => result.subjectId === coreId)
      if (!coreResult) {
        configurationErrors.push(`Core subject ${coreId} is not part of the scheme`)
        continue
      }
      // An N/A core subject is never silently removed from the core condition.
      if (coreResult.outcome === "NOT_APPLICABLE" || coreResult.outcome === "REQUIRES_REVIEW") {
        coreSubjectsUnresolved = true
      }
    }
  }

  if (anyRequiresReview) {
    blockers.push("One or more subjects require review (pending/missing marks or unresolved absence)")
  }
  if (coreSubjectsUnresolved) {
    blockers.push("A core subject is not applicable or unresolved and cannot be silently removed")
  }
  for (const error of configurationErrors) blockers.push(error)

  let overallPercentage: Rational | null = null
  let overallResult: AnnualResult

  if (configurationErrors.length > 0 || anyRequiresReview || coreSubjectsUnresolved) {
    overallResult = "REQUIRES_REVIEW"
  } else if (resolvedSubjectCount === 0) {
    overallResult = "UNRESOLVED"
    blockers.push("The resolved subject set is empty; the overall result cannot be determined")
  } else {
    overallPercentage = computeOverallPercentage(results, input.subjects, policy)
    overallResult = evaluateOverallMode({
      mode: policy.overallPassMode,
      overallPercentage,
      overallPassPercent,
      maxFailedSubjects: policy.maxFailedSubjects,
      failedCount,
      coreSubjectIds: policy.coreSubjectIds,
      results,
    })
  }

  return {
    subjects: results,
    resolvedSubjectCount,
    failedCount,
    overallPercentage: overallPercentage ? toFixedDecimal(overallPercentage) : null,
    overallPercentageValue: overallPercentage ? rationalToNumber(overallPercentage) : null,
    overallResult,
    requiresReview: configurationErrors.length > 0 || anyRequiresReview || coreSubjectsUnresolved,
    blockers,
    configurationErrors,
  }
}
