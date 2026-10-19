import { z } from "zod"

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")

export const listPeriodsQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  academicSessionId: z.string().uuid().optional(),
})

export const correctPeriodSchema = z
  .object({
    classId: z.string().uuid().optional(),
    sectionId: z.string().uuid().nullable().optional(),
    effectiveFrom: dateString.optional(),
    effectiveTo: dateString.nullable().optional(),
  })
  .strict()

export type ListPeriodsQuery = z.infer<typeof listPeriodsQuerySchema>
export type CorrectPeriodInput = z.infer<typeof correctPeriodSchema>
