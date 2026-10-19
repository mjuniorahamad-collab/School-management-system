// Validation schemas for Report Card scheme configuration
// (docs/report-card.md §2, §4, §5, §7; M6a).
//
// Shape-and-type validation only. Cross-field policy rules (which fields each
// `overallPassMode` requires, weight-sum tolerances, percent bounds) live in
// `report-card-scheme.rules.ts` as pure functions so they are unit-testable
// without a database. Referential checks (does this session/class/section/
// exam-type/subject belong to the authenticated school?) are enforced inside
// the service transaction, never here.

import { z } from "zod"
import {
  absencePolicySchema,
  aggregationPolicySchema,
  decimalStringSchema,
  overallPassModeSchema,
} from "../report-cards/report-card.schema.js"

/**
 * A decimal may arrive as an exact string or as a JSON number. It is normalized
 * to an exact decimal string in `report-card-scheme.rules.ts` before it ever
 * reaches a DECIMAL column; the number form exists so clients are not forced to
 * stringify, not because binary floats are acceptable for persistence.
 */
const decimalInputSchema = z.union([z.number().finite(), decimalStringSchema])

export const reportCardSchemeExamInputSchema = z
  .object({
    examTypeId: z.string().uuid("Exam type id must be a UUID"),
    weight: decimalInputSchema.optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()

export const upsertReportCardSchemeSchema = z
  .object({
    academicSessionId: z.string().uuid("Academic session id must be a UUID"),
    classId: z.string().uuid("Class id must be a UUID"),
    sectionId: z.string().uuid("Section id must be a UUID").nullish(),
    aggregationPolicy: aggregationPolicySchema,
    absencePolicy: absencePolicySchema.optional().default("EXCLUDE_AND_REVIEW"),
    overallPassMode: overallPassModeSchema,
    annualSubjectPassPercent: decimalInputSchema,
    overallPassPercent: decimalInputSchema.nullish(),
    maxFailedSubjects: z.number().int().min(0).nullish(),
    coreSubjectIds: z.array(z.string().uuid("Core subject id must be a UUID")).optional().default([]),
    publicationMode: z.literal("REQUIRE_DECISION").optional().default("REQUIRE_DECISION"),
    exams: z.array(reportCardSchemeExamInputSchema).min(1, "At least one scheme exam is required"),
  })
  .strict()

export const listReportCardSchemesQuerySchema = z.object({
  academicSessionId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
})

export type ReportCardSchemeExamInput = z.infer<typeof reportCardSchemeExamInputSchema>
export type UpsertReportCardSchemeInput = z.infer<typeof upsertReportCardSchemeSchema>
export type ListReportCardSchemesQuery = z.infer<typeof listReportCardSchemesQuerySchema>
