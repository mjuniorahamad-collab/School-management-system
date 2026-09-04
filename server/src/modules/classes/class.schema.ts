import { z } from "zod"

export const createClassSchema = z
  .object({
    name: z.string().trim().min(1, "Class name is required").max(100),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()

export const updateClassSchema = createClassSchema.partial().strict()

export const listClassesQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreateClassInput = z.infer<typeof createClassSchema>
export type UpdateClassInput = z.infer<typeof updateClassSchema>
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>
