// Presentation helpers for Report Card status/outcome enums.
//
// Pure and side-effect free: label lookups plus lifecycle predicates only.
// These NEVER recompute official grades, totals, percentages or pass/fail
// outcomes — those are computed once by the backend engine and frozen into the
// card. Every helper degrades safely for an unknown value.

import type {
  ReportCardAnnualResult,
  ReportCardExamResolutionReason,
  ReportCardExamResolutionStatus,
  ReportCardMarkStatus,
  ReportCardStatus,
  ReportCardSubjectOutcome,
  ReportCardSubjectOutcomeReason,
} from "@/types/reportCard"

export const REPORT_CARD_STATUS_LABELS: Record<ReportCardStatus, string> = {
  DRAFT: "Draft",
  PENDING_ARCHIVE: "Pending archive",
  ISSUED: "Issued",
  SUPERSEDED: "Superseded",
  VOID: "Void",
}

export const REPORT_CARD_ANNUAL_RESULT_LABELS: Record<ReportCardAnnualResult, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  UNRESOLVED: "Unresolved",
  REQUIRES_REVIEW: "Requires review",
}

export const REPORT_CARD_SUBJECT_OUTCOME_LABELS: Record<ReportCardSubjectOutcome, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  NOT_APPLICABLE: "Not applicable",
  REQUIRES_REVIEW: "Requires review",
}

export const REPORT_CARD_SUBJECT_OUTCOME_REASON_LABELS: Record<
  ReportCardSubjectOutcomeReason,
  string
> = {
  PENDING_OR_MISSING_MARKS: "Pending or missing marks",
  ALL_NOT_APPLICABLE: "All exams not applicable",
  ABSENT_FORCED_FAIL: "Absent (forced fail)",
  ABSENT_EXCLUDED_REVIEW: "Absent (excluded, needs review)",
  WEIGHTS_UNAVAILABLE: "Exam weights unavailable",
  SUBJECT_PASS_PERCENT_UNAVAILABLE: "Subject pass percent unavailable",
}

/** The frozen per-exam marking status. SCORED carries marks; the rest do not. */
export const REPORT_CARD_MARK_STATUS_LABELS: Record<ReportCardMarkStatus, string> = {
  SCORED: "Scored",
  ABSENT: "Absent",
  NOT_APPLICABLE: "Not applicable",
  PENDING: "Pending",
}

export const REPORT_CARD_EXAM_RESOLUTION_STATUS_LABELS: Record<
  ReportCardExamResolutionStatus,
  string
> = {
  RESOLVED: "Resolved",
  NOT_FINAL: "Not final",
  AMBIGUOUS: "Ambiguous",
  MISSING: "Missing",
  OUT_OF_SCOPE: "Out of scope",
}

export const REPORT_CARD_EXAM_RESOLUTION_REASON_LABELS: Record<
  ReportCardExamResolutionReason,
  string
> = {
  CROSS_SECTION_DUPLICATE: "Cross-section duplicate",
  CLASS_CHANGE: "Class change",
  NO_RESULT_ROW: "No result row",
  NO_EXAM_INSTANCE: "No exam instance",
  IMPLICIT: "Implicit match",
}

/** Converts a SCREAMING_SNAKE value into a readable fallback label. */
function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function resolveLabel(
  labels: Record<string, string>,
  value: string | null | undefined,
  fallback: string,
): string {
  if (value === null || value === undefined || value === "") return fallback
  return labels[value] ?? humanize(value)
}

export function reportCardStatusLabel(status: string | null | undefined): string {
  return resolveLabel(REPORT_CARD_STATUS_LABELS, status, "Unknown")
}

export function reportCardAnnualResultLabel(result: string | null | undefined): string {
  return resolveLabel(REPORT_CARD_ANNUAL_RESULT_LABELS, result, "Unknown")
}

export function reportCardSubjectOutcomeLabel(outcome: string | null | undefined): string {
  return resolveLabel(REPORT_CARD_SUBJECT_OUTCOME_LABELS, outcome, "Unknown")
}

export function reportCardSubjectOutcomeReasonLabel(reason: string | null | undefined): string {
  return resolveLabel(REPORT_CARD_SUBJECT_OUTCOME_REASON_LABELS, reason, "—")
}

export function reportCardExamResolutionStatusLabel(status: string | null | undefined): string {
  return resolveLabel(REPORT_CARD_EXAM_RESOLUTION_STATUS_LABELS, status, "Unknown")
}

export function reportCardExamResolutionReasonLabel(reason: string | null | undefined): string {
  return resolveLabel(REPORT_CARD_EXAM_RESOLUTION_REASON_LABELS, reason, "—")
}

export function reportCardMarkStatusLabel(status: string | null | undefined): string {
  return resolveLabel(REPORT_CARD_MARK_STATUS_LABELS, status, "—")
}

// ── Lifecycle predicates ─────────────────────────────────────────────────────
// Mirrors the backend transition guards (report-card.service.ts /
// report-card.artifact.service.ts). Unknown statuses are never actionable.

/** Only a DRAFT can be published (§8). */
export function canPublishReportCard(status: string | null | undefined): boolean {
  return status === "DRAFT"
}

/** Only a PENDING_ARCHIVE card can be issued (§9). */
export function canIssueReportCard(status: string | null | undefined): boolean {
  return status === "PENDING_ARCHIVE"
}

/**
 * An archive may be attached unless the version is a DRAFT (publish first) or
 * already SUPERSEDED/VOID (§9.6).
 */
export function canAttachReportCardArchive(status: string | null | undefined): boolean {
  return status === "PENDING_ARCHIVE" || status === "ISSUED"
}
