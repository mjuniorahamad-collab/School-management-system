import { z } from "zod"

export const createSectionSchema = z
  .object({
    classId: z.string().min(1, "Class is required"),
    name: z.string().trim().min(1, "Section name is required").max(100),
  })
  .strict()

export const updateSectionSchema = createSectionSchema.partial().strict()

export const listSectionsQuerySchema = z.object({
  classId: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreateSectionInput = z.infer<typeof createSectionSchema>
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>
export type ListSectionsQuery = z.infer<typeof listSectionsQuerySchema>
