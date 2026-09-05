import { z } from "zod"
import { moneySchema } from "../../lib/money.js"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

const itemSchema = z
  .object({
    feeHeadId: z.string().trim().min(1, "Fee head is required").max(64),
    amount: moneySchema,
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()

const itemArraySchema = z
  .array(itemSchema)
  .min(1, "At least one fee item is required")
  .max(50, "A fee structure can have at most 50 items")
  .superRefine((items, ctx) => {
    const seen = new Set<string>()
    for (const item of items) {
      if (seen.has(item.feeHeadId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feeHeadId"],
          message: "A fee head may only appear once per fee structure",
        })
        return
      }
      seen.add(item.feeHeadId)
    }
  })

export const createFeeStructureSchema = z
  .object({
    name: z.string().trim().min(1, "Structure name is required").max(100),
    sessionId: z.string().trim().min(1, "Academic session is required").max(64),
    classId: z.string().trim().min(1, "Class is required").max(64),
    isActive: z.boolean().optional(),
    items: itemArraySchema,
  })
  .strict()

export const updateFeeStructureSchema = z
  .object({
    name: z.string().trim().min(1, "Structure name is required").max(100),
    sessionId: z.string().trim().min(1).max(64),
    classId: z.string().trim().min(1).max(64),
    isActive: z.boolean(),
    items: itemArraySchema,
  })
  .partial()
  .strict()

export const FEE_STRUCTURE_SORT_BY = ["name", "totalAmount", "updatedAt"] as const
export const SORT_DIRECTIONS = ["asc", "desc"] as const

export const listFeeStructuresQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  sessionId: optionalParam(z.string().trim().min(1).max(64)),
  classId: optionalParam(z.string().trim().min(1).max(64)),
  isActive: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(FEE_STRUCTURE_SORT_BY).optional().default("name"),
  sortDir: z.enum(SORT_DIRECTIONS).optional().default("asc"),
})

export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>
export type UpdateFeeStructureInput = z.infer<typeof updateFeeStructureSchema>
export type ListFeeStructuresQuery = z.infer<typeof listFeeStructuresQuerySchema>
export type FeeStructureItemInput = z.infer<typeof itemSchema>