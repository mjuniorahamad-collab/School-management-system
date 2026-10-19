// Domain types for the Report Card scheme configuration module. Mirrors the
// backend contract (server/src/modules/report-card-schemes/report-card-scheme.types.ts
// and report-card-scheme.schema.ts, M6a).
//
// Decimals are transported as exact decimal strings (never binary floats),
// matching the report-card engine's value contract.

export type AggregationPolicy = "RAW" | "PERCENTAGE_WEIGHTED"

export type AbsencePolicy = "EXCLUDE_AND_REVIEW" | "TREAT_SUBJECT_AS_FAILED"

export type OverallPassMode =
  | "ALL_SUBJECTS"
  | "PERCENT_AND_MAX_FAILED"
  | "CORE_SUBJECTS_AND_PERCENT"

/** V1 has exactly one publication mode (docs/report-card.md §8). */
export type ReportCardPublicationMode = "REQUIRE_DECISION"

export const AGGREGATION_POLICY_OPTIONS: readonly AggregationPolicy[] = [
  "RAW",
  "PERCENTAGE_WEIGHTED",
]

export const AGGREGATION_POLICY_LABELS: Record<AggregationPolicy, string> = {
  RAW: "Raw marks",
  PERCENTAGE_WEIGHTED: "Percentage weighted",
}

export const ABSENCE_POLICY_OPTIONS: readonly AbsencePolicy[] = [
  "EXCLUDE_AND_REVIEW",
  "TREAT_SUBJECT_AS_FAILED",
]

export const ABSENCE_POLICY_LABELS: Record<AbsencePolicy, string> = {
  EXCLUDE_AND_REVIEW: "Exclude and review",
  TREAT_SUBJECT_AS_FAILED: "Treat subject as failed",
}

export const OVERALL_PASS_MODE_OPTIONS: readonly OverallPassMode[] = [
  "ALL_SUBJECTS",
  "PERCENT_AND_MAX_FAILED",
  "CORE_SUBJECTS_AND_PERCENT",
]

export const OVERALL_PASS_MODE_LABELS: Record<OverallPassMode, string> = {
  ALL_SUBJECTS: "All subjects",
  PERCENT_AND_MAX_FAILED: "Percent and max failed",
  CORE_SUBJECTS_AND_PERCENT: "Core subjects and percent",
}

export interface ReportCardSchemeExamItem {
  id: string
  examTypeId: string
  examTypeName: string | null
  /** Exact decimal string (per-exam weight, ignored by RAW aggregation). */
  weight: string
  sortOrder: number
}

export interface ReportCardSchemeDetail {
  id: string
  academicSessionId: string
  classId: string
  sectionId: string | null
  /** `sectionId` for a section scheme; `__CLASS__` for a class-level scheme. */
  scopeKey: string
  aggregationPolicy: AggregationPolicy
  absencePolicy: AbsencePolicy
  overallPassMode: OverallPassMode
  annualSubjectPassPercent: string
  overallPassPercent: string | null
  maxFailedSubjects: number | null
  coreSubjectIds: string[]
  publicationMode: ReportCardPublicationMode
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  exams: ReportCardSchemeExamItem[]
}

export interface ReportCardSchemeListResult {
  items: ReportCardSchemeDetail[]
  total: number
}

export interface ReportCardSchemeListQuery {
  academicSessionId?: string
  classId?: string
  sectionId?: string
}

export interface ReportCardSchemeExamInput {
  examTypeId: string
  weight?: number | string
  sortOrder?: number
}

/**
 * The scheme identity is its (session, class, section) scope, so there is no
 * create/update split: the backend upserts idempotently via PUT.
 */
export interface UpsertReportCardSchemeInput {
  academicSessionId: string
  classId: string
  sectionId?: string | null
  aggregationPolicy: AggregationPolicy
  absencePolicy?: AbsencePolicy
  overallPassMode: OverallPassMode
  annualSubjectPassPercent: number | string
  overallPassPercent?: number | string | null
  maxFailedSubjects?: number | null
  coreSubjectIds?: string[]
  publicationMode?: ReportCardPublicationMode
  exams: ReportCardSchemeExamInput[]
}
