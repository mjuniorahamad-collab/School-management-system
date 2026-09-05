import { z } from "zod"
import { moneySchema } from "../../lib/money.js"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

const paymentDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "paymentDate must be formatted as YYYY-MM-DD")

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"] as const

/**
 * Idempotency key: a per-submission token the client generates once and reuses
 * on retries. The server stores it uniquely per school; repeating a recorded
 * key replays the original payment + receipt instead of duplicating.
 */
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "idempotencyKey must be at least 8 characters")
  .max(100, "idempotencyKey is too long")

export const createPaymentSchema = z
  .object({
    invoiceId: z.string().trim().min(1, "Invoice is required").max(64),
    amount: moneySchema,
    method: z.enum(PAYMENT_METHODS),
    paymentDate: paymentDateSchema,
    transactionRef: optionalParam(z.string().trim().min(1).max(100)),
    notes: optionalParam(z.string().trim().min(1).max(500)),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()

export const PAYMENT_SORT_BY = ["createdAt", "paymentDate", "amount"] as const
export const SORT_DIRECTIONS = ["asc", "desc"] as const

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  invoiceId: optionalParam(z.string().trim().min(1).max(64)),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: optionalParam(paymentDateSchema),
  to: optionalParam(paymentDateSchema),
  search: optionalParam(z.string().trim().min(1).max(100)),
  sortBy: z.enum(PAYMENT_SORT_BY).optional().default("createdAt"),
  sortDir: z.enum(SORT_DIRECTIONS).optional().default("desc"),
})

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>