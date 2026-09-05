import { z } from "zod"

const markRowSchema = z.object({
  enrollmentId: z.string().uuid(),
  /** Shared/cleared cells send null (keys off `isAbsent` to distinguish). */
  obtainedMarks: z.number().min(0, "Marks cannot be negative").max(99999.99).nullish(),
  isAbsent: z.boolean().optional().default(false),
  remarks: z
    .union([z.literal(""), z.string().trim().min(1).max(500)])
    .nullish()
    .transform((value) => (value ?? null) || null),
})

export const putSubjectMarksSchema = z
  .object({
    rows: z.array(markRowSchema).min(1, "At least one mark row is required").max(100),
  })
  .strict()

export const resultSheetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export type MarkRowInput = z.infer<typeof markRowSchema>
export type PutSubjectMarksInput = z.infer<typeof putSubjectMarksSchema>
export type ResultSheetQuery = z.infer<typeof resultSheetQuerySchema>