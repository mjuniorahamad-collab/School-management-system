import { z } from "zod"

export const createFeeHeadSchema = z
  .object({
    code: z.string().trim().min(1, "Fee head code is required").max(20),
    name: z.string().trim().min(1, "Fee head name is required").max(100),
    isRecurring: z.boolean().optional(),
  })
  .strict()

export const updateFeeHeadSchema = createFeeHeadSchema.partial().strict()

export const listFeeHeadsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreateFeeHeadInput = z.infer<typeof createFeeHeadSchema>
export type UpdateFeeHeadInput = z.infer<typeof updateFeeHeadSchema>
export type ListFeeHeadsQuery = z.infer<typeof listFeeHeadsQuerySchema>
