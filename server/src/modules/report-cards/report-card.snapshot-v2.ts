// Snapshot v2 contract for the Annual Report Card (docs/report-card.md 8a).
//
// v1 froze only the academic computation (ids, policy, outcomes). v2 additionally
// freezes the human-readable identity a report card is rendered from, so a
// printed/archived document never reaches back to mutable live rows:
//
//   - school identity (the canonical branding projection);
//   - student name and admission number;
//   - session / class / section ids and display names;
//   - each resolved concrete exam (type name, exam name, dates);
//   - each subject name and its per-exam marks (max, obtained, status);
//   - the validated signatory names and roles.
//
// Everything here is a pure projection: callers pass already-authorized values
// (DECIMALs as canonical strings) and this module only assembles and orders them.
// Mutable workflow / PDF-artifact metadata is never part of the payload, so it can
// never affect the snapshot hash. Attendance, remarks and any issue/document date
// are deliberately absent: they are deferred until their policies are specified,
// and a PDF generated before issuance must never claim an issue date.

import {
  MAX_REPORT_CARD_SIGNATORIES,
  type ReportCardSignatory,
  type SchoolBranding,
} from "../../lib/school-settings.js"
import type {
  AggregationPolicy,
  AbsencePolicy,
  AnnualResult,
  ExamResolutionReason,
  ExamResolutionStatus,
  MarkStatus,
  OverallPassMode,
  SubjectOutcome,
  SubjectOutcomeReason,
} from "./report-card.types.js"

export const REPORT_CARD_SNAPSHOT_VERSION = 2 as const

export type ReportCardSnapshotVersion = typeof REPORT_CARD_SNAPSHOT_VERSION

// ── Frozen payload (the exact object that is hashed) ──────────────────────────

export interface ReportCardSnapshotSchool extends SchoolBranding {
  id: string
}

export interface ReportCardSnapshotStudent {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
}

export interface ReportCardSnapshotPlacement {
  id: string
  name: string
}

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

export interface ReportCardSnapshotExamResolution {
  examTypeId: string
  examTypeName: string
  examId: string | null
  examName: string | null
  examStartDate: string | null
  examEndDate: string | null
  status: ExamResolutionStatus
  reason: ExamResolutionReason | null
}

export interface ReportCardSnapshotSubjectMark {
  examId: string
  maxMarks: string
  obtainedMarks: string | null
  status: MarkStatus
}

export interface ReportCardSnapshotSubject {
  subjectId: string
  subjectName: string
  isCore: boolean
  outcome: SubjectOutcome
  percentage: string | null
  grade: string | null
  reason: SubjectOutcomeReason | null
  includedExamIds: string[]
  excludedExamIds: string[]
  absentExamIds: string[]
  marks: ReportCardSnapshotSubjectMark[]
}

export interface ReportCardSnapshotOverall {
  result: AnnualResult
  percentage: string | null
  failedCount: number | null
  resolvedSubjectCount: number | null
  requiresReview: boolean
}

export interface ReportCardSnapshotV2 {
  schemaVersion: ReportCardSnapshotVersion
  schoolId: string
  studentId: string
  academicSessionId: string
  classId: string
  sectionId: string | null
  school: ReportCardSnapshotSchool
  student: ReportCardSnapshotStudent
  session: ReportCardSnapshotPlacement
  class: ReportCardSnapshotPlacement
  section: ReportCardSnapshotPlacement | null
  scheme: ReportCardSnapshotScheme
  examResolutions: ReportCardSnapshotExamResolution[]
  subjects: ReportCardSnapshotSubject[]
  overall: ReportCardSnapshotOverall
  signatories: ReportCardSignatory[]
}

export interface BuildSnapshotV2Input {
  schoolId: string
  studentId: string
  academicSessionId: string
  classId: string
  sectionId: string | null
  school: ReportCardSnapshotSchool
  student: ReportCardSnapshotStudent
  session: ReportCardSnapshotPlacement
  class: ReportCardSnapshotPlacement
  section: ReportCardSnapshotPlacement | null
  scheme: ReportCardSnapshotScheme
  examResolutions: ReportCardSnapshotExamResolution[]
  subjects: ReportCardSnapshotSubject[]
  overall: ReportCardSnapshotOverall
  signatories: ReportCardSignatory[]
}

// ── Pure builder ──────────────────────────────────────────────────────────────

function byString(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function brandingFields(value: SchoolBranding): SchoolBranding {
  return {
    schoolName: value.schoolName,
    tagline: value.tagline,
    schoolShortName: value.schoolShortName,
    contactPhone: value.contactPhone,
    contactEmail: value.contactEmail,
    addressLine1: value.addressLine1,
    addressLine2: value.addressLine2,
    city: value.city,
    state: value.state,
    postalCode: value.postalCode,
    country: value.country,
  }
}

/**
 * Assembles the frozen v2 payload. Pure: it only copies and canonically orders
 * the values it is given, so its output is deterministic for identical input and
 * carries no mutable workflow metadata.
 */
export function buildSnapshotV2(input: BuildSnapshotV2Input): ReportCardSnapshotV2 {
  return {
    schemaVersion: REPORT_CARD_SNAPSHOT_VERSION,
    schoolId: input.schoolId,
    studentId: input.studentId,
    academicSessionId: input.academicSessionId,
    classId: input.classId,
    sectionId: input.sectionId,
    school: { id: input.school.id, ...brandingFields(input.school) },
    student: {
      id: input.student.id,
      admissionNumber: input.student.admissionNumber,
      firstName: input.student.firstName,
      middleName: input.student.middleName,
      lastName: input.student.lastName,
    },
    session: { id: input.session.id, name: input.session.name },
    class: { id: input.class.id, name: input.class.name },
    section: input.section ? { id: input.section.id, name: input.section.name } : null,
    scheme: {
      id: input.scheme.id,
      scopeKey: input.scheme.scopeKey,
      aggregationPolicy: input.scheme.aggregationPolicy,
      absencePolicy: input.scheme.absencePolicy,
      overallPassMode: input.scheme.overallPassMode,
      annualSubjectPassPercent: input.scheme.annualSubjectPassPercent,
      overallPassPercent: input.scheme.overallPassPercent,
      maxFailedSubjects: input.scheme.maxFailedSubjects,
      coreSubjectIds: [...input.scheme.coreSubjectIds].sort(byString),
      gradingBands: input.scheme.gradingBands.map((band) => ({
        minPercent: band.minPercent,
        maxPercent: band.maxPercent,
        grade: band.grade,
      })),
      exams: input.scheme.exams
        .map((exam) => ({ examTypeId: exam.examTypeId, weight: exam.weight }))
        .sort((a, b) => byString(a.examTypeId, b.examTypeId)),
    },
    examResolutions: input.examResolutions
      .map((entry) => ({ ...entry }))
      .sort((a, b) => byString(a.examTypeId, b.examTypeId)),
    subjects: input.subjects
      .map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        isCore: subject.isCore,
        outcome: subject.outcome,
        percentage: subject.percentage,
        grade: subject.grade,
        reason: subject.reason,
        includedExamIds: [...subject.includedExamIds].sort(byString),
        excludedExamIds: [...subject.excludedExamIds].sort(byString),
        absentExamIds: [...subject.absentExamIds].sort(byString),
        marks: subject.marks
          .map((mark) => ({ ...mark }))
          .sort((a, b) => byString(a.examId, b.examId)),
      }))
      .sort((a, b) => byString(a.subjectId, b.subjectId)),
    overall: {
      result: input.overall.result,
      percentage: input.overall.percentage,
      failedCount: input.overall.failedCount,
      resolvedSubjectCount: input.overall.resolvedSubjectCount,
      requiresReview: input.overall.requiresReview,
    },
    signatories: input.signatories.map((signatory) => ({
      role: signatory.role,
      name: signatory.name,
    })),
  }
}

// ── Shared frozen-signatory validation ────────────────────────────────────────

export type FrozenSignatoryReason = "MISSING" | "CORRUPT"

export type FrozenSignatoriesValidation =
  | { ok: true; signatories: ReportCardSignatory[] }
  | { ok: false; reason: FrozenSignatoryReason }

/**
 * Validates a frozen signatory value. A valid list is a non-empty array (at most
 * MAX_REPORT_CARD_SIGNATORIES) of { role, name } entries with non-empty trimmed
 * strings. Absent/empty is MISSING; anything else is CORRUPT. This is the single
 * acceptance rule shared by the generation gate and the publication gate, so a
 * card can never be generated or published with signatories the other step would
 * reject.
 */
export function validateFrozenSignatories(value: unknown): FrozenSignatoriesValidation {
  if (value === null || value === undefined) return { ok: false, reason: "MISSING" }
  if (!Array.isArray(value)) return { ok: false, reason: "CORRUPT" }
  if (value.length === 0) return { ok: false, reason: "MISSING" }
  if (value.length > MAX_REPORT_CARD_SIGNATORIES) return { ok: false, reason: "CORRUPT" }

  const signatories: ReportCardSignatory[] = []
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return { ok: false, reason: "CORRUPT" }
    const candidate = entry as Record<string, unknown>
    const role = typeof candidate.role === "string" ? candidate.role.trim() : ""
    const name = typeof candidate.name === "string" ? candidate.name.trim() : ""
    if (role === "" || name === "") return { ok: false, reason: "CORRUPT" }
    signatories.push({ role, name })
  }
  return { ok: true, signatories }
}