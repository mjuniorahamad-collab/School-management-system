import { z } from "zod"
import { moneySchema } from "../../lib/money.js"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

export const ADJUSTMENT_KINDS = ["FIXED_AMOUNT", "PERCENTAGE"] as const
export const ADJUSTMENT_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED", "REVERSED"] as const
export const ADJUSTMENT_SORT_BY = ["createdAt", "value", "computedAmount", "status"] as const
export const SORT_DIRECTIONS = ["asc", "desc"] as const

const reasonSchema = z.string().trim().min(1, "Reason must not be empty").max(500, "Reason is too long")

/**
 * Requesting a concession against an invoice. `invoiceId` is REQUIRED in the
 * current phase (the adjustment applies to an already-generated invoice); the
 * pre-invoice (student, session) form that attaches at generation time is a
 * later phase. A percentage is validated against 100 at the boundary so the
 * money rules can assume a sane input.
 */
export const requestAdjustmentSchema = z
  .object({
    invoiceId: z.string().trim().min(1, "Invoice is required").max(64),
    kind: z.enum(ADJUSTMENT_KINDS),
    value: moneySchema,
    reason: optionalParam(reasonSchema),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.kind === "PERCENTAGE" && data.value > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A percentage concession cannot exceed 100",
      })
    }
  })

export const overrideAdjustmentSchema = z
  .object({
    overrideReason: reasonSchema,
  })
  .strict()

export const adjustActionSchema = z
  .object({
    reason: optionalParam(reasonSchema),
  })
  .strict()

export const listAdjustmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: optionalParam(z.string().trim().min(1).max(64)),
  sessionId: optionalParam(z.string().trim().min(1).max(64)),
  invoiceId: optionalParam(z.string().trim().min(1).max(64)),
  status: z.enum(ADJUSTMENT_STATUSES).optional(),
  kind: z.enum(ADJUSTMENT_KINDS).optional(),
  search: optionalParam(z.string().trim().min(1).max(100)),
  sortBy: z.enum(ADJUSTMENT_SORT_BY).optional().default("createdAt"),
  sortDir: z.enum(SORT_DIRECTIONS).optional().default("desc"),
})

export type RequestAdjustmentInput = z.infer<typeof requestAdjustmentSchema>
export type OverrideAdjustmentInput = z.infer<typeof overrideAdjustmentSchema>
export type AdjustActionInput = z.infer<typeof adjustActionSchema>
export type ListAdjustmentsQuery = z.infer<typeof listAdjustmentsQuerySchema>