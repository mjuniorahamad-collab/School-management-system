import { z } from "zod"
import { moneySchema } from "../../lib/money.js"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be formatted as YYYY-MM-DD")

export const installmentInputSchema = z
  .object({
    label: z.string().trim().min(1, "Installment label is required").max(100),
    amount: moneySchema,
    dueDate: dueDateSchema,
  })
  .strict()

export const generateInvoicesSchema = z
  .object({
    sessionId: z.string().trim().min(1, "Academic session is required").max(64),
    classId: z.string().trim().min(1, "Class is required").max(64),
    installments: z
      .array(installmentInputSchema)
      .min(1, "At least one installment is required")
      .max(12, "An invoice can have at most 12 installments")
      .optional(),
  })
  .strict()

export const generationPreviewSchema = z
  .object({
    sessionId: z.string().trim().min(1, "Academic session is required").max(64),
    classId: z.string().trim().min(1, "Class is required").max(64),
  })
  .strict()

export const INVOICE_SORT_BY = ["createdAt", "invoiceNumber", "totalAmount", "studentName"] as const
export const INVOICE_STATUSES = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"] as const
export const INVOICE_SORT_DIRECTIONS = ["asc", "desc"] as const

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sessionId: optionalParam(z.string().trim().min(1).max(64)),
  classId: optionalParam(z.string().trim().min(1).max(64)),
  status: z.enum(INVOICE_STATUSES).optional(),
  search: optionalParam(z.string().trim().min(1).max(100)),
  sortBy: z.enum(INVOICE_SORT_BY).optional().default("createdAt"),
  sortDir: z.enum(INVOICE_SORT_DIRECTIONS).optional().default("desc"),
})

export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>
export type GenerationPreviewInput = z.infer<typeof generationPreviewSchema>
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>
export type InstallmentInput = z.infer<typeof installmentInputSchema>