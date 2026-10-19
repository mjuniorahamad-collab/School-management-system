// Domain types for the Annual Report Card module. Mirrors the backend contract
// (server/src/modules/report-cards/*, docs/report-card.md).
//
// NOTE: unlike the scheme endpoints (which map rows to clean DTOs), the
// report-card endpoints return RAW Prisma rows. These shapes therefore include
// internal identifiers (`schoolId`, `enrollmentId`, `snapshotHash`,
// `createdByUserId`, `publishedByUserId`) that exist on the wire but are NOT
// display fields and must never be surfaced as such.
//
// Decimals are serialized by Prisma to exact decimal strings (`Decimal.toJSON`)
// and DateTimes to ISO strings, matching every other raw-row response.

import type {
  AbsencePolicy,
  AggregationPolicy,
  OverallPassMode,
} from "@/types/reportCardScheme"

export type { AbsencePolicy, AggregationPolicy, OverallPassMode }

export type ReportCardStatus = "DRAFT" | "PENDING_ARCHIVE" | "ISSUED" | "SUPERSEDED" | "VOID"

export type ReportCardAnnualResult = "PASS" | "FAIL" | "UNRESOLVED" | "REQUIRES_REVIEW"

export type ReportCardSubjectOutcome = "PASS" | "FAIL" | "NOT_APPLICABLE" | "REQUIRES_REVIEW"

export type ReportCardSubjectOutcomeReason =
  | "PENDING_OR_MISSING_MARKS"
  | "ALL_NOT_APPLICABLE"
  | "ABSENT_FORCED_FAIL"
  | "ABSENT_EXCLUDED_REVIEW"
  | "WEIGHTS_UNAVAILABLE"
  | "SUBJECT_PASS_PERCENT_UNAVAILABLE"

export type ReportCardExamResolutionStatus =
  | "RESOLVED"
  | "NOT_FINAL"
  | "AMBIGUOUS"
  | "MISSING"
  | "OUT_OF_SCOPE"

export type ReportCardExamResolutionReason =
  | "CROSS_SECTION_DUPLICATE"
  | "CLASS_CHANGE"
  | "NO_RESULT_ROW"
  | "NO_EXAM_INSTANCE"
  | "IMPLICIT"

/** Per-subject, per-exam mark status frozen into a v2 snapshot. */
export type ReportCardMarkStatus = "SCORED" | "ABSENT" | "NOT_APPLICABLE" | "PENDING"

/** The archived-PDF mismatch reasons the backend can return in `error.details`. */
export type ReportCardArchiveMismatchReason = "REPORT_CARD" | "VERSION" | "SNAPSHOT_HASH"

// ── Frozen snapshot ──────────────────────────────────────────────────────────
// The immutable payload written at generation time (report-card.service.ts).
// It is version-aware (`schemaVersion`) and always hashed as stored.
//
// v1 carries only what the engine computed (ids, policy, outcomes). v2 adds the
// human-readable identity a report card is rendered from — school branding,
// student name, session/class/section names, exam and subject names, per-mark
// detail and the frozen signatories. Neither version includes attendance,
// remarks or an issue/document date; consumers must not invent those.

export interface ReportCardSnapshotSchemeExam {
  examTypeId: string
  weight: string
}

export interface ReportCardSnapshotGradingBand {
  minPercent: number
  maxPercent: number
  grade: string
}

export interface ReportCardSnapshotScheme {
  id: string
  scopeKey: string
  aggregationPolicy: AggregationPolicy
  absencePolicy: AbsencePolicy
  overallPassMode: OverallPassMode
  annualSubjectPassPercent: string
  overallPassPercent: string | null
  maxFailedSubjects: number | null
  coreSubjectIds: string[]
  gradingBands: ReportCardSnapshotGradingBand[]
  exams: ReportCardSnapshotSchemeExam[]
}

export interface ReportCardSnapshotOverall {
  result: ReportCardAnnualResult
  percentage: string | null
  failedCount: number | null
  resolvedSubjectCount: number | null
  requiresReview: boolean
}

/** A frozen signatory (v2): a school-authored role label and signer name. */
export interface ReportCardSignatory {
  role: string
  name: string
}

export interface ReportCardSnapshotV1ExamResolution {
  examTypeId: string
  examId: string | null
  status: ReportCardExamResolutionStatus
  reason: ReportCardExamResolutionReason | null
}

export interface ReportCardSnapshotV1Subject {
  subjectId: string
  isCore: boolean
  outcome: ReportCardSubjectOutcome
  percentage: string | null
  grade: string | null
  reason: ReportCardSubjectOutcomeReason | null
  includedExamIds: string[]
  excludedExamIds: string[]
  absentExamIds: string[]
}

/**
 * Schema version 1: the original academic-only payload. Retained so legacy cards
 * remain fully typed; new cards are written as v2.
 */
export interface ReportCardSnapshotV1 {
  schemaVersion: 1
  schoolId: string
  studentId: string
  academicSessionId: string
  classId: string
  sectionId: string | null
  scheme: ReportCardSnapshotScheme
  examResolutions: ReportCardSnapshotV1ExamResolution[]
  subjects: ReportCardSnapshotV1Subject[]
  overall: ReportCardSnapshotOverall
}

export interface ReportCardSnapshotV2School {
  id: string
  schoolName: string
  tagline: string | null
  schoolShortName: string | null
  contactPhone: string | null
  contactEmail: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}

export interface ReportCardSnapshotV2Student {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
}

export interface ReportCardSnapshotV2Placement {
  id: string
  name: string
}

export interface ReportCardSnapshotV2ExamResolution {
  examTypeId: string
  examTypeName: string
  examId: string | null
  examName: string | null
  /** Canonical `YYYY-MM-DD`, or null when no concrete exam was frozen. */
  examStartDate: string | null
  examEndDate: string | null
  status: ReportCardExamResolutionStatus
  reason: ReportCardExamResolutionReason | null
}

export interface ReportCardSnapshotV2SubjectMark {
  examId: string
  maxMarks: string
  obtainedMarks: string | null
  status: ReportCardMarkStatus
}

export interface ReportCardSnapshotV2Subject extends ReportCardSnapshotV1Subject {
  subjectName: string
  marks: ReportCardSnapshotV2SubjectMark[]
}

/**
 * Schema version 2: freezes the human-readable identity a report card is
 * rendered from, so a printed/archived document never reads mutable live rows.
 */
export interface ReportCardSnapshotV2 {
  schemaVersion: 2
  schoolId: string
  studentId: string
  academicSessionId: string
  classId: string
  sectionId: string | null
  school: ReportCardSnapshotV2School
  student: ReportCardSnapshotV2Student
  session: ReportCardSnapshotV2Placement
  class: ReportCardSnapshotV2Placement
  section: ReportCardSnapshotV2Placement | null
  scheme: ReportCardSnapshotScheme
  examResolutions: ReportCardSnapshotV2ExamResolution[]
  subjects: ReportCardSnapshotV2Subject[]
  overall: ReportCardSnapshotOverall
  signatories: ReportCardSignatory[]
}

export type ReportCardSnapshot = ReportCardSnapshotV1 | ReportCardSnapshotV2

// ── Report card rows ─────────────────────────────────────────────────────────

/** The base ReportCard row as returned by the API (raw Prisma transport shape). */
export interface ReportCard {
  id: string
  schoolId: string
  academicSessionId: string
  studentId: string
  enrollmentId: string
  classId: string
  sectionId: string | null
  version: number
  status: ReportCardStatus
  overallResult: ReportCardAnnualResult | null
  overallPercentage: string | null
  failedCount: number | null
  resolvedSubjectCount: number | null
  requiresReview: boolean
  snapshot: ReportCardSnapshot | null
  snapshotHash: string | null
  publishedAt: string | null
  issuedAt: string | null
  supersedesReportCardId: string | null
  reissueReason: string | null
  createdByUserId: string | null
  publishedByUserId: string | null
  createdAt: string
  updatedAt: string
}

/** The student summary embedded on both list and detail responses. */
export interface ReportCardStudentSummary {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
}

export interface ReportCardSubject {
  id: string
  reportCardId: string
  subjectId: string
  isCore: boolean
  outcome: ReportCardSubjectOutcome
  percentage: string | null
  grade: string | null
  reason: ReportCardSubjectOutcomeReason | null
  includedExamIds: string[]
  excludedExamIds: string[]
  absentExamIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ReportCardExamResolution {
  id: string
  reportCardId: string
  examTypeId: string
  examId: string | null
  status: ReportCardExamResolutionStatus
  reason: ReportCardExamResolutionReason | null
  createdAt: string
  updatedAt: string
}

/** A list row: the card plus the embedded student summary (no subjects/resolutions). */
export interface ReportCardListItem extends ReportCard {
  student: ReportCardStudentSummary
}

/** A detail row: the list row plus the frozen per-subject and per-exam rows. */
export interface ReportCardDetail extends ReportCardListItem {
  subjects: ReportCardSubject[]
  examResolutions: ReportCardExamResolution[]
}

/** The confirmed PDF archive row (raw Prisma transport shape). */
export interface ReportCardArtifact {
  id: string
  schoolId: string
  reportCardId: string
  version: number
  snapshotHash: string
  storageKey: string
  sha256: string
  byteSize: number
  filename: string | null
  uploadedByUserId: string | null
  uploadedAt: string
  confirmedByUserId: string | null
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReportCardPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ReportCardListResult {
  items: ReportCardListItem[]
  total: number
  pagination: ReportCardPagination
}

export interface ReportCardListQuery {
  page?: number
  pageSize?: number
  studentId?: string
  academicSessionId?: string
  classId?: string
  sectionId?: string
  status?: ReportCardStatus
}

/**
 * Generation is always scoped to a student's session placement. `sectionId`
 * absent/null uses the enrollment's section. `reissueReason` is required by the
 * server only when superseding an already-published version.
 */
export interface GenerateReportCardInput {
  studentId: string
  academicSessionId: string
  classId: string
  sectionId?: string | null
  reissueReason?: string
}
