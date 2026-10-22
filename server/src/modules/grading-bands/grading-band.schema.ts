import { z } from "zod"

export const createGradingBandSchema = z
  .object({
    minPercent: z.number().int().min(0, "Minimum percentage must be 0–100").max(100),
    maxPercent: z.number().int().min(0, "Maximum percentage must be 0–100").max(100),
    grade: z.string().trim().min(1, "Grade is required").max(5),
    description: z.string().trim().max(200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    // Creating a band as inactive is almost never the intended action; the UI
    // defaults to active and offers a separate deactivate action. It is still
    // accepted for tests/future tooling but the service keeps the created
    // record active unless explicitly set.
    isActive: z.boolean().optional(),
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
    isActive: z.boolean().optional(),
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
  // When true the list returns inactive bands as well. Defaults to false so
  // administrative UIs must opt in; grading lookups never use this flag.
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
})

export type CreateGradingBandInput = z.infer<typeof createGradingBandSchema>
export type UpdateGradingBandInput = z.infer<typeof updateGradingBandSchema>
export type ListGradingBandsQuery = z.infer<typeof listGradingBandsQuerySchema>
