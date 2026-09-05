import { z } from "zod"
import { AuditAction, AuditEntityType } from "@prisma/client"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

const auditActionSchema = z.enum(Object.values(AuditAction) as [string, ...string[]])
const auditEntityTypeSchema = z.enum(Object.values(AuditEntityType) as [string, ...string[]])
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be formatted as YYYY-MM-DD")

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  entityType: optionalParam(auditEntityTypeSchema),
  action: optionalParam(auditActionSchema),
  actorId: optionalParam(z.string().trim().min(1).max(64)),
  entityId: optionalParam(z.string().trim().min(1).max(64)),
  from: optionalParam(dateSchema),
  to: optionalParam(dateSchema),
  search: optionalParam(z.string().trim().min(1).max(100)),
  sortBy: z.enum(["createdAt"]).optional().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>