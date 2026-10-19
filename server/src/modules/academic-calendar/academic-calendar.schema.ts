import { z } from "zod"
import { WEEKDAYS } from "./academic-calendar.types.js"

const weekdayEnum = z.enum(WEEKDAYS)
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
const calendarDayKindEnum = z.enum(["INSTRUCTIONAL", "NON_INSTRUCTIONAL"])

export const upsertCalendarSchema = z
  .object({
    workingWeekdays: z.array(weekdayEnum).min(1, "At least one working weekday is required"),
  })
  .strict()

export const listCalendarDaysQuerySchema = z.object({
  academicSessionId: z.string().uuid(),
  from: dateString.optional(),
  to: dateString.optional(),
})

export const createCalendarDaySchema = z
  .object({
    academicSessionId: z.string().uuid(),
    date: dateString,
    kind: calendarDayKindEnum,
    // Validated against the kind in the rules layer (0 for NON_INSTRUCTIONAL,
    // 0.5 or 1 for INSTRUCTIONAL) to allow a clean domain error.
    instructionalValue: z.number(),
    label: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()

export const updateCalendarDaySchema = z
  .object({
    kind: calendarDayKindEnum.optional(),
    instructionalValue: z.number().optional(),
    label: z.string().trim().min(1).max(120).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()

export type UpsertCalendarInput = z.infer<typeof upsertCalendarSchema>
export type ListCalendarDaysQuery = z.infer<typeof listCalendarDaysQuerySchema>
export type CreateCalendarDayInput = z.infer<typeof createCalendarDaySchema>
export type UpdateCalendarDayInput = z.infer<typeof updateCalendarDaySchema>
