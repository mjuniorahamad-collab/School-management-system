// Report Card scheme configuration DTOs (docs/report-card.md §2, M6a).
//
// HTTP-facing value objects only: no Prisma, no database. The service maps
// persisted rows into these shapes. Decimals are serialized as exact decimal
// strings (never binary floats), matching the report-card engine contract.

import type {
  AbsencePolicy,
  AggregationPolicy,
  OverallPassMode,
} from "../report-cards/report-card.types.js"

/** V1 has exactly one publication mode (docs/report-card.md §8). */
export type ReportCardPublicationMode = "REQUIRE_DECISION"

export interface ReportCardSchemeExamDTO {
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
  exams: ReportCardSchemeExamDTO[]
}

export interface ReportCardSchemeListResult {
  items: ReportCardSchemeDetail[]
  total: number
}
