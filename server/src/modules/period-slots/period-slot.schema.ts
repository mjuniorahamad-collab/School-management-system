import { z } from "zod"

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(timePattern, "Use 24-hour HH:MM format")

export const createPeriodSlotSchema = z
  .object({
    name: z.string().trim().min(1, "Period name is required").max(50),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((value) => value.startTime < value.endTime, {
    path: ["endTime"],
    message: "End time must be after start time",
  })

export const updatePeriodSlotSchema = z
  .object({
    name: z.string().trim().min(1, "Period name is required").max(50).optional(),
    startTime: timeOfDaySchema.optional(),
    endTime: timeOfDaySchema.optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.startTime === undefined ||
      value.endTime === undefined ||
      value.startTime < value.endTime,
    { path: ["endTime"], message: "End time must be after start time" },
  )

export const listPeriodSlotsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreatePeriodSlotInput = z.infer<typeof createPeriodSlotSchema>
export type UpdatePeriodSlotInput = z.infer<typeof updatePeriodSlotSchema>
export type ListPeriodSlotsQuery = z.infer<typeof listPeriodSlotsQuerySchema>
