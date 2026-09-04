import { z } from "zod"

export const SESSION_STATUSES = ["UPCOMING", "ACTIVE", "CLOSED"] as const

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")

const sessionFields = z
  .object({
    name: z.string().trim().min(1, "Session name is required").max(200),
    code: z.string().trim().min(1, "Session code is required").max(50),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    status: z.enum(SESSION_STATUSES).optional(),
  })
  .strict()

export const createSessionSchema = sessionFields.refine((value) => value.startDate < value.endDate, {
  message: "End date must be after the start date",
  path: ["endDate"],
})

export const updateSessionSchema = sessionFields.partial()

export const listSessionsQuerySchema = z.object({
  status: z.enum(SESSION_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>
