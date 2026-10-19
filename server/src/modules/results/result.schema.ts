import { z } from "zod"

const markStatusEnum = z.enum(["SCORED", "ABSENT", "NOT_APPLICABLE", "PENDING"])

const markRowSchema = z
  .object({
    enrollmentId: z.string().uuid(),
    /** Shared/cleared cells send null (keys off `isAbsent` to distinguish). */
    obtainedMarks: z.number().min(0, "Marks cannot be negative").max(99999.99).nullish(),
    isAbsent: z.boolean().optional().default(false),
    status: markStatusEnum.optional(),
    remarks: z
      .union([z.literal(""), z.string().trim().min(1).max(500)])
      .nullish()
      .transform((value) => (value ?? null) || null),
  })
  .superRefine((data, ctx) => {
    const hasMarks = data.obtainedMarks !== null && data.obtainedMarks !== undefined
    const status = data.status

    // The legacy `isAbsent` flag means "absent"; it cannot coexist with an
    // explicit non-ABSENT status. When status is ABSENT, the service coerces
    // `isAbsent` to true, so a bare `{ status: "ABSENT" }` stays valid.
    if (data.isAbsent && status && status !== "ABSENT") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "isAbsent cannot be combined with a non-ABSENT status",
      })
    }

    if (status === "ABSENT" && hasMarks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An ABSENT mark cannot carry obtained marks",
      })
    }

    if (status === "PENDING" && hasMarks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A PENDING mark cannot carry obtained marks",
      })
    }

    if (status === "NOT_APPLICABLE" && hasMarks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A NOT_APPLICABLE mark cannot carry obtained marks",
      })
    }
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