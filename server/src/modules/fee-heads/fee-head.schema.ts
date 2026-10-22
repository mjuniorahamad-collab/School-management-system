import { z } from "zod"

export const createFeeHeadSchema = z
  .object({
    code: z.string().trim().min(1, "Fee head code is required").max(20),
    name: z.string().trim().min(1, "Fee head name is required").max(100),
    isRecurring: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()

export const updateFeeHeadSchema = createFeeHeadSchema.partial().strict()

export const listFeeHeadsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  // When true the list returns inactive fee heads as well. Defaults to false.
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
})

export type CreateFeeHeadInput = z.infer<typeof createFeeHeadSchema>
export type UpdateFeeHeadInput = z.infer<typeof updateFeeHeadSchema>
export type ListFeeHeadsQuery = z.infer<typeof listFeeHeadsQuerySchema>
