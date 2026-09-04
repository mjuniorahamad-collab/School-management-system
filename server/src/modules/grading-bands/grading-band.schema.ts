import { z } from "zod"

export const createGradingBandSchema = z
  .object({
    minPercent: z.number().int().min(0, "Minimum percentage must be 0–100").max(100),
    maxPercent: z.number().int().min(0, "Maximum percentage must be 0–100").max(100),
    grade: z.string().trim().min(1, "Grade is required").max(5),
    description: z.string().trim().max(200).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((value) => value.minPercent <= value.maxPercent, {
    path: ["maxPercent"],
    message: "Maximum percentage must be greater than or equal to the minimum",
  })

export const updateGradingBandSchema = z
  .object({
    minPercent: z.number().int().min(0).max(100).optional(),
    maxPercent: z.number().int().min(0).max(100).optional(),
    grade: z.string().trim().min(1, "Grade is required").max(5).optional(),
    description: z.string().trim().max(200).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.minPercent === undefined ||
      value.maxPercent === undefined ||
      value.minPercent <= value.maxPercent,
    { path: ["maxPercent"], message: "Maximum percentage must be greater than or equal to the minimum" },
  )

export const listGradingBandsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreateGradingBandInput = z.infer<typeof createGradingBandSchema>
export type UpdateGradingBandInput = z.infer<typeof updateGradingBandSchema>
export type ListGradingBandsQuery = z.infer<typeof listGradingBandsQuerySchema>
