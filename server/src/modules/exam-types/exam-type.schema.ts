import { z } from "zod"

export const createExamTypeSchema = z
  .object({
    code: z.string().trim().min(1, "Exam type code is required").max(20),
    name: z.string().trim().min(1, "Exam type name is required").max(100),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()

export const updateExamTypeSchema = createExamTypeSchema.partial().strict()

export const listExamTypesQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  // When true the list returns inactive exam types as well. Defaults to false.
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
})

export type CreateExamTypeInput = z.infer<typeof createExamTypeSchema>
export type UpdateExamTypeInput = z.infer<typeof updateExamTypeSchema>
export type ListExamTypesQuery = z.infer<typeof listExamTypesQuerySchema>
