import { z } from "zod"

export const createExamTypeSchema = z
  .object({
    code: z.string().trim().min(1, "Exam type code is required").max(20),
    name: z.string().trim().min(1, "Exam type name is required").max(100),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()

export const updateExamTypeSchema = createExamTypeSchema.partial().strict()

export const listExamTypesQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreateExamTypeInput = z.infer<typeof createExamTypeSchema>
export type UpdateExamTypeInput = z.infer<typeof updateExamTypeSchema>
export type ListExamTypesQuery = z.infer<typeof listExamTypesQuerySchema>
