import { z } from "zod"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be formatted as YYYY-MM-DD")

export const listReceiptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  invoiceId: optionalParam(z.string().trim().min(1).max(64)),
  from: optionalParam(dateSchema),
  to: optionalParam(dateSchema),
  search: optionalParam(z.string().trim().min(1).max(100)),
  sortBy: z.enum(["createdAt", "receiptDate", "amount"]).optional().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>