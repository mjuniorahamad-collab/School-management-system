import { Prisma, type AuditAction, type AuditEntityType } from "@prisma/client"
import { notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { logWarn } from "../../lib/logger.js"
import { SUPER_ADMIN_ROLE } from "../../permissions/permissions.js"
import type { AuthUser } from "../../types/auth.js"
import { redactObject, sanitizeDiffForWrite } from "./audit-log.redact.js"
import type {
  AuditActor,
  AuditLogDetail,
  AuditLogListItem,
  AuditLogListResult,
  AuditRecordInput,
} from "./audit-log.types.js"
import type { ListAuditLogsQuery } from "./audit-log.schema.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

/**
 * Writes a single audit record through the provided db client.
 *
 * Passed the SAME transaction client (`tx`) as the business write for
 * critical/security/financial mutations so the audit is atomic with the
 * mutation (both commit or both roll back). Passed the standalone `prisma`
 * client for best-effort, post-commit writes.
 *
 * Metadata and diff are sanitized here (defense-in-depth) so secrets never
 * reach the database even if an instrumentation site forgot to redact.
 */
export async function recordAudit(client: DbClient, input: AuditRecordInput): Promise<void> {
  await client.auditLog.create({
    data: {
      schoolId: input.schoolId ?? null,
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: (input.metadata
        ? (redactObject(input.metadata as Record<string, unknown>) as Prisma.InputJsonValue)
        : undefined),
      diff: (sanitizeDiffForWrite(input.diff) as unknown as Prisma.InputJsonValue | undefined) ?? undefined,
    },
    select: { id: true },
  })
}

/**
 * Resolves the actor snapshot for audit attribution. The tenant role is read
 * from the actor's membership in the given school; SUPER_ADMIN and anything
 * else falls back to the actor's role claim so platform-level actors are not
 * understated.
 */
export async function resolveAuditActor(
  client: DbClient,
  schoolId: string | null,
  auth: AuthUser,
): Promise<AuditActor> {
  let role = auth.roles[0] ?? "USER"
  if (auth.roles.includes(SUPER_ADMIN_ROLE)) {
    role = SUPER_ADMIN_ROLE
  } else if (schoolId) {
    const membership = await client.tenantMembership.findFirst({
      where: { userId: auth.id, schoolId },
      select: { role: { select: { name: true } } },
    })
    if (membership) role = membership.role.name
  }
  return { id: auth.id, name: auth.name, email: auth.email, role }
}

/**
 * Best-effort audit write for non-critical / bulk events. Runs AFTER the
 * business transaction has committed and never throws back into the business
 * path; a failed audit write is logged server-side and silently tolerated.
 */
export async function recordAuditAfterCommit(input: AuditRecordInput): Promise<void> {
  try {
    const prisma = await requirePrisma()
    await recordAudit(prisma, input)
  } catch (error) {
    logWarn(`Audit write failed (${input.action} ${input.entityType}): ${String(error)}`)
  }
}

type AuditLogRow = {
  id: string
  schoolId: string | null
  actorId: string
  actorName: string
  actorRole: string
  actorEmail: string | null
  action: AuditAction
  entityType: AuditEntityType
  entityId: string | null
  summary: string
  metadata: Prisma.JsonValue | null
  diff: Prisma.JsonValue | null
  createdAt: Date
}

function toListItem(row: AuditLogRow): AuditLogListItem {
  return {
    id: row.id,
    actorName: row.actorName,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }
}

function toDetail(row: AuditLogRow): AuditLogDetail {
  return {
    ...toListItem(row),
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    schoolId: row.schoolId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    diff: (row.diff as AuditLogDetail["diff"]) ?? null,
  }
}

export async function listAuditLogs(
  query: ListAuditLogsQuery,
  schoolId: string,
): Promise<AuditLogListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.AuditLogWhereInput = { schoolId }
  where.entityType = query.entityType as AuditEntityType | undefined
  where.action = query.action as AuditAction | undefined
  if (query.actorId) where.actorId = query.actorId
  if (query.entityId) where.entityId = { contains: query.entityId, mode: "insensitive" }
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = new Date(`${query.from}T00:00:00.000Z`)
    if (query.to) where.createdAt.lte = new Date(`${query.to}T23:59:59.999Z`)
  }
  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const }
    where.OR = [
      { actorName: contains },
      { actorEmail: contains },
      { summary: contains },
      { entityId: contains },
    ]
  }

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: query.sortDir === "asc" ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows.map((row) => toListItem(row as unknown as AuditLogRow)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

/**
 * Returns a single audit record scoped to the caller's tenant. Direct-ID access
 * across tenants resolves to a 404 so tenant membership never leaks.
 */
export async function getAuditLogById(
  id: string,
  schoolId: string,
): Promise<AuditLogDetail> {
  const prisma = await requirePrisma()
  const row = await prisma.auditLog.findFirst({ where: { id, schoolId } })
  if (!row) throw notFoundError("Audit log not found")
  return toDetail(row as unknown as AuditLogRow)
}

const EXPORT_LIMIT = 5_000

/** Serializes tenant-scoped audit records to CSV (BOM-prefixed for Excel). */
export function auditLogsToCsv(items: AuditLogDetail[]): string {
  const header = [
    "Timestamp",
    "Actor",
    "Actor Role",
    "Action",
    "Entity Type",
    "Entity ID",
    "Summary",
  ]
  const escapeCell = (value: string | null | undefined): string => {
    const text = value ?? ""
    return `"${text.replace(/"/g, '""')}"`
  }
  const lines = items.map((item) =>
    [
      item.createdAt,
      item.actorName,
      item.actorRole,
      item.action,
      item.entityType,
      item.entityId,
      item.summary,
    ]
      .map((cell) => escapeCell(cell as string | null | undefined))
      .join(","),
  )
  return `\uFEFF${header.join(",")}\n${lines.join("\n")}\n`
}

export async function exportAuditLogsCsv(
  query: ListAuditLogsQuery,
  schoolId: string,
): Promise<string> {
  const prisma = await requirePrisma()
  const where: Prisma.AuditLogWhereInput = { schoolId }
  where.entityType = query.entityType as AuditEntityType | undefined
  where.action = query.action as AuditAction | undefined
  if (query.actorId) where.actorId = query.actorId

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
  })
  return auditLogsToCsv(rows.map((row) => toDetail(row as unknown as AuditLogRow)))
}