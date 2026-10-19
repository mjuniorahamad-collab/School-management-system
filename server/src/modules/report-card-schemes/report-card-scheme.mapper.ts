// Maps persisted Report Card scheme rows to HTTP DTOs (M6a).
//
// Decimals are emitted as exact decimal strings via `Decimal.toString()`, never
// as binary floats, matching the report-card engine's value contract.

import type { Prisma } from "@prisma/client"
import type { ReportCardSchemeDetail, ReportCardSchemeExamDTO } from "./report-card-scheme.types.js"

/** Shareable include so the service payload type and mapper stay in lockstep. */
export const REPORT_CARD_SCHEME_INCLUDE = {
  exams: {
    orderBy: { sortOrder: "asc" as const },
    include: { examType: { select: { name: true } } },
  },
} satisfies Prisma.ReportCardSchemeInclude

export type ReportCardSchemeWithExams = Prisma.ReportCardSchemeGetPayload<{
  include: typeof REPORT_CARD_SCHEME_INCLUDE
}>

function toExamDTO(exam: ReportCardSchemeWithExams["exams"][number]): ReportCardSchemeExamDTO {
  return {
    id: exam.id,
    examTypeId: exam.examTypeId,
    examTypeName: exam.examType?.name ?? null,
    weight: exam.weight.toString(),
    sortOrder: exam.sortOrder,
  }
}

export function toReportCardSchemeDetail(
  scheme: ReportCardSchemeWithExams,
): ReportCardSchemeDetail {
  return {
    id: scheme.id,
    academicSessionId: scheme.academicSessionId,
    classId: scheme.classId,
    sectionId: scheme.sectionId,
    scopeKey: scheme.scopeKey,
    aggregationPolicy: scheme.aggregationPolicy,
    absencePolicy: scheme.absencePolicy,
    overallPassMode: scheme.overallPassMode,
    annualSubjectPassPercent: scheme.annualSubjectPassPercent.toString(),
    overallPassPercent: scheme.overallPassPercent?.toString() ?? null,
    maxFailedSubjects: scheme.maxFailedSubjects,
    coreSubjectIds: scheme.coreSubjectIds,
    publicationMode: scheme.publicationMode,
    createdByUserId: scheme.createdByUserId,
    createdAt: scheme.createdAt.toISOString(),
    updatedAt: scheme.updatedAt.toISOString(),
    exams: scheme.exams.map(toExamDTO),
  }
}
