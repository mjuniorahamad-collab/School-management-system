import { z } from "zod"

export const createSubjectSchema = z
  .object({
    code: z.string().trim().min(1, "Subject code is required").max(20),
    name: z.string().trim().min(1, "Subject name is required").max(100),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()

export const updateSubjectSchema = createSubjectSchema.partial().strict()

export const listSubjectsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>
