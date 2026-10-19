// HTTP-boundary schemas for the Report Card module (M3).
//
// Request shapes only: the academic rules live in the pure engine
// (report-card.schema.ts / report-card.aggregation.ts). Ids are validated as
// UUIDs and pagination follows the repo-wide `page`/`pageSize` convention.

import { z } from "zod"

const uuid = z.string().uuid()

/**
 * Generation is always scoped to a student's session placement. `sectionId` is
 * optional: absent/null means the enrollment's section is used.
 *
 * `reissueReason` is required only when generation supersedes an already
 * published version (PENDING_ARCHIVE/ISSUED); the service enforces that, so it
 * stays optional at the HTTP boundary (docs/report-card.md §8).
 */
export const generateReportCardSchema = z
  .object({
    studentId: uuid,
    academicSessionId: uuid,
    classId: uuid,
    sectionId: uuid.nullish().transform((value) => value ?? null),
    reissueReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()

export const listReportCardsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: uuid.optional(),
  academicSessionId: uuid.optional(),
  classId: uuid.optional(),
  sectionId: uuid.optional(),
  status: z.enum(["DRAFT", "PENDING_ARCHIVE", "ISSUED", "SUPERSEDED", "VOID"]).optional(),
})

export type GenerateReportCardInput = z.infer<typeof generateReportCardSchema>
export type ListReportCardsInput = z.infer<typeof listReportCardsSchema>
