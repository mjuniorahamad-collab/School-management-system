// Annual Report Card domain types (docs/report-card.md).
//
// Pure types only: no Prisma, no database, no HTTP. The engine consumes plain
// value objects so it is fully testable without a database, and the M3
// generation service is responsible for projecting Prisma rows into these
// shapes.

// ────────────────────────────────────────────────────────────────────────────
// Mark status (docs/report-card.md §4)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-subject, per-exam mark status.
 *
 * - `SCORED` — a real obtained mark.
 * - `ABSENT` — the student sat no scorable paper; never a zero (§4).
 * - `NOT_APPLICABLE` — the subject was not assessed in that exam; excluded from
 *   the annual computation for the subject.
 * - `PENDING` — the mark has not been entered; blocks generation for the
 *   subject.
 *
 * A missing `ExamMark` row is a missing-data problem and is projected to
 * `PENDING` by the caller; it is never silently treated as ABSENT or zero.
 */
export type MarkStatus = "SCORED" | "ABSENT" | "NOT_APPLICABLE" | "PENDING"

// ────────────────────────────────────────────────────────────────────────────
// Configurable policy (docs/report-card.md §5, §6, §13)
// ────────────────────────────────────────────────────────────────────────────

/** How a subject's annual percentage pools its exams. */
export type AggregationPolicy = "RAW" | "PERCENTAGE_WEIGHTED"

/** What an all-absent subject resolves to. */
export type AbsencePolicy = "EXCLUDE_AND_REVIEW" | "TREAT_SUBJECT_AS_FAILED"

/** How the overall PASS/FAIL is decided (§6). */
export type OverallPassMode =
  | "ALL_SUBJECTS"
  | "PERCENT_AND_MAX_FAILED"
  | "CORE_SUBJECTS_AND_PERCENT"

// ────────────────────────────────────────────────────────────────────────────
// Outcomes (docs/report-card.md §6)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Subject outcome is SEPARATE from the overall result (§6 outcome separation).
 *
 * - `PASS` / `FAIL` — a resolved subject (a forced-fail subject is `FAIL`).
 * - `NOT_APPLICABLE` — every mark was N/A; excluded from failedCount,
 *   subjectCount and all-subjects.
 * - `REQUIRES_REVIEW` — blocked by pending/missing marks or an unresolved
 *   absence (`EXCLUDE_AND_REVIEW`).
 */
export type SubjectOutcome = "PASS" | "FAIL" | "NOT_APPLICABLE" | "REQUIRES_REVIEW"

/** Overall result. `UNRESOLVED` = empty resolved set or a missing numeric mean. */
export type AnnualResult = "PASS" | "FAIL" | "UNRESOLVED" | "REQUIRES_REVIEW"

// ────────────────────────────────────────────────────────────────────────────
// Exam resolution (docs/report-card.md §3)
// ────────────────────────────────────────────────────────────────────────────

export type ExamInstanceStatus = "DRAFT" | "PUBLISHED" | "FINAL" | "ARCHIVED"

export type ExamResolutionStatus =
  | "RESOLVED"
  | "NOT_FINAL"
  | "AMBIGUOUS"
  | "MISSING"
  | "OUT_OF_SCOPE"

export type ExamResolutionReason =
  | "CROSS_SECTION_DUPLICATE"
  | "CLASS_CHANGE"
  | "NO_RESULT_ROW"
  | "NO_EXAM_INSTANCE"
  | "IMPLICIT"

/**
 * The resolution of one scheme exam type to a concrete `Exam.id` for a single
 * student. `blocks` means generation must fail closed; `requiresReview` is the
 * subset that also needs a human decision (ambiguity / implicit match).
 */
export interface ExamResolution {
  examTypeId: string
  status: ExamResolutionStatus
  reason: ExamResolutionReason | null
  /** The concrete exam the type resolved to, when `status === "RESOLVED"`. */
  examId: string | null
  blocks: boolean
  requiresReview: boolean
}

/** A concrete exam instance in the session (projected from `Exam`). */
export interface ExamInstanceInput {
  id: string
  examTypeId: string
  classId: string
  sectionId: string | null
  status: ExamInstanceStatus
}

/** One `ExamResult` row already on the student for a concrete exam. */
export interface StudentExamResultRow {
  examId: string
  examTypeId: string
  /** The class of the concrete exam the result belongs to. */
  classId: string
  sectionId: string | null
}

// ────────────────────────────────────────────────────────────────────────────
// Annual computation (docs/report-card.md §5, §6)
// ────────────────────────────────────────────────────────────────────────────

/** One mark for a subject in one concrete exam. */
export interface SubjectExamMark {
  examId: string
  status: MarkStatus
  /** Exact decimal string (never a binary float) when `status === "SCORED"`. */
  obtainedMarks: string | null
  /** Exact decimal string. */
  maxMarks: string
}

/** One subject's marks across the scheme's resolved concrete exams. */
export interface AnnualSubjectInput {
  subjectId: string
  isCore: boolean
  marks: SubjectExamMark[]
}

/** A grading band, structurally identical to the results module's rule (§5). */
export interface GradingBand {
  minPercent: number
  maxPercent: number
  grade: string
}

/** Resolved annual policy. Missing required values are the caller's config error. */
export interface AnnualPolicyInput {
  aggregationPolicy: AggregationPolicy
  absencePolicy: AbsencePolicy
  overallPassMode: OverallPassMode
  /** Mandatory (§6). Exact decimal string. */
  annualSubjectPassPercent: string
  /** Required for `PERCENT_AND_MAX_FAILED` / `CORE_SUBJECTS_AND_PERCENT`. */
  overallPassPercent: string | null
  /** Required for `PERCENT_AND_MAX_FAILED`; `0 <= N < resolvedSubjectCount`. */
  maxFailedSubjects: number | null
  /** Required for `CORE_SUBJECTS_AND_PERCENT`; must be a subset of selected. */
  coreSubjectIds: string[]
  gradingBands: readonly GradingBand[]
}

export interface AnnualComputationInput {
  subjects: AnnualSubjectInput[]
  /** examId -> exact decimal weight. Ignored for `RAW`. */
  examWeights: Record<string, string>
  policy: AnnualPolicyInput
}

/** A resolved subject's frozen annual values. */
export interface SubjectAnnualResult {
  subjectId: string
  isCore: boolean
  outcome: SubjectOutcome
  /** Canonical 2-dp string, or null when the subject has no numeric percentage. */
  percentage: string | null
  percentageValue: number | null
  grade: string | null
  /** Concrete exams that contributed a scored mark. */
  includedExamIds: string[]
  /** Exams excluded as `NOT_APPLICABLE`. */
  excludedExamIds: string[]
  /** Exams excluded as `ABSENT`. */
  absentExamIds: string[]
  reason: SubjectOutcomeReason | null
}

export type SubjectOutcomeReason =
  | "PENDING_OR_MISSING_MARKS"
  | "ALL_NOT_APPLICABLE"
  | "ABSENT_FORCED_FAIL"
  | "ABSENT_EXCLUDED_REVIEW"
  | "WEIGHTS_UNAVAILABLE"
  | "SUBJECT_PASS_PERCENT_UNAVAILABLE"

export interface AnnualComputationResult {
  subjects: SubjectAnnualResult[]
  /** Subjects counted for pass/fail: PASS + FAIL (forced-fail included). */
  resolvedSubjectCount: number
  /** Subjects whose outcome is FAIL, including forced fails. */
  failedCount: number
  overallPercentage: string | null
  overallPercentageValue: number | null
  overallResult: AnnualResult
  /** True when any subject or config condition requires human review. */
  requiresReview: boolean
  /** Blocking conditions (pending/missing data, unresolved absence, config). */
  blockers: string[]
  /** Missing or corrupt required configuration (§7). */
  configurationErrors: string[]
}
