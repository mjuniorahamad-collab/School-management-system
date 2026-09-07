import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { dedupeIds } from "./notification.rules.js"
import type { CreateNotificationInput, ListNotificationsQuery } from "./notification.schema.js"
import type {
  CreateNotificationResult,
  NotificationListItem,
  NotificationListResult,
  UnreadNotificationCountResult,
} from "./notification.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function resolveGuardianUserIds(client: DbClient, studentId: string): Promise<string[]> {
  return client.studentGuardian
    .findMany({
      where: { studentId },
      select: { guardian: { select: { userId: true } } },
    })
    .then((rows) => dedupeIds(rows.map((row) => row.guardian.userId).filter((userId): userId is string => Boolean(userId))))
}

/**
 * Resolves direct recipient IDs and/or role targets into concrete receiving
 * user accounts. Every target must be an ACTIVE membership in THIS school whose
 * role carries `notifications:view` and whose account is ACTIVE. Invalid,
 * foreign-school, or un-notifiable targets fail loudly so typos never silently
 * drop people. The sender is always excluded.
 */
async function resolveRecipients(
  client: DbClient,
  schoolId: string,
  recipientIds: string[] | undefined,
  roleNames: string[] | undefined,
  senderId: string,
): Promise<string[]> {
  const resolved = new Set<string>()

  if (recipientIds && recipientIds.length > 0) {
    const memberships = await client.tenantMembership.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        userId: { in: recipientIds, not: senderId },
        user: { status: "ACTIVE" },
        role: { rolePermissions: { some: { permission: { code: "notifications:view" } } } },
      },
      select: { userId: true },
    })
    if (memberships.length !== recipientIds.length) {
      throw badRequestError("One or more recipients cannot be notified")
    }
    for (const membership of memberships) resolved.add(membership.userId)
  }

  if (roleNames && roleNames.length > 0) {
    const memberships = await client.tenantMembership.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        userId: { not: senderId },
        user: { status: "ACTIVE" },
        role: {
          name: { in: roleNames },
          rolePermissions: { some: { permission: { code: "notifications:view" } } },
        },
      },
      select: { userId: true, role: { select: { name: true } } },
    })
    const foundRoleNames = new Set(memberships.map((membership) => membership.role.name))
    const missingRoles = roleNames.filter((roleName) => !foundRoleNames.has(roleName))
    if (missingRoles.length > 0) {
      throw badRequestError("One or more role targets are not notifiable roles", { roles: missingRoles })
    }
    for (const membership of memberships) resolved.add(membership.userId)
  }

  return [...resolved]
}

export async function createNotification(
  input: CreateNotificationInput,
  schoolId: string,
  actor: AuthUser,
): Promise<CreateNotificationResult> {
  const prisma = await requirePrisma()
  const recipientIds = await resolveRecipients(prisma, schoolId, input.recipientIds, input.roleNames, actor.id)
  // Decision: an empty resolution is a loud client error, never a silent no-op.
  if (recipientIds.length === 0) {
    throw badRequestError("No active recipients match the selected targets")
  }

  const resolvedActor = await resolveAuditActor(prisma, schoolId, actor)
  const created = await prisma.$transaction(async (tx) => {
    const notification = await tx.notification.create({
      data: {
        schoolId,
        type: "ADMIN",
        title: input.title,
        body: input.body ?? null,
        linkPath: input.linkPath ?? null,
        sourceEntityType: null,
        sourceEntityId: null,
        recipients: {
          create: recipientIds.map((recipientId) => ({ userId: recipientId })),
        },
      },
      select: { id: true },
    })
    await recordAudit(tx, {
      schoolId,
      actorId: resolvedActor.id,
      actorName: resolvedActor.name,
      actorEmail: resolvedActor.email,
      actorRole: resolvedActor.role,
      action: "CREATE",
      entityType: "NOTIFICATION",
      entityId: notification.id,
      summary: `Sent notification "${input.title}" to ${recipientIds.length} recipient${recipientIds.length === 1 ? "" : "s"}`,
      metadata: {
        recipientCount: recipientIds.length,
        ...(input.roleNames && input.roleNames.length > 0 ? { targetRoleNames: input.roleNames } : {}),
      },
    })
    return notification
  })

  return { notificationId: created.id, recipientCount: recipientIds.length }
}

/**
 * Emits an automatic, source-anchored notification inside the caller's own
 * transaction. Three safety properties:
 *   - No recipients → a silent no-op (business flow already audited).
 *   - Idempotent by `@@unique([schoolId, type, sourceEntityType, sourceEntityId])`:
 *     a re-issued event (e.g. replayed payment) never duplicates.
 *   - The pre-check is defended by the unique constraint: P2002 on a concurrent
 *     duplicate is swallowed identically.
 * Automatic emission is intentionally NOT audit-logged — the source write
 * (invoice/payment/link) owns its audit trail and read-state is private.
 */
export async function emitNotifications(
  client: DbClient,
  params: {
    schoolId: string
    type: "FEE_INVOICE" | "FEE_PAYMENT" | "PORTAL_LINK" | "ADMIN"
    title: string
    body?: string
    linkPath?: string
    sourceEntityType: string
    sourceEntityId: string
    recipientUserIds: string[]
  },
): Promise<{ emitted: boolean; recipientCount: number }> {
  const recipientUserIds = dedupeIds(params.recipientUserIds)
  if (recipientUserIds.length === 0) return { emitted: false, recipientCount: 0 }

  const sourceKey = {
    schoolId: params.schoolId,
    type: params.type,
    sourceEntityType: params.sourceEntityType,
    sourceEntityId: params.sourceEntityId,
  }
  const existing = await client.notification.findUnique({
    where: { schoolId_type_sourceEntityType_sourceEntityId: sourceKey },
    select: { id: true },
  })
  if (existing) return { emitted: false, recipientCount: 0 }

  try {
    await client.notification.create({
      data: {
        ...sourceKey,
        title: params.title,
        body: params.body ?? null,
        linkPath: params.linkPath ?? null,
        recipients: {
          create: recipientUserIds.map((recipientId) => ({ userId: recipientId })),
        },
      },
      select: { id: true },
    })
    return { emitted: true, recipientCount: recipientUserIds.length }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { emitted: false, recipientCount: 0 }
    }
    throw error
  }
}

export async function listMyNotifications(
  query: ListNotificationsQuery,
  schoolId: string,
  userId: string,
): Promise<NotificationListResult> {
  const prisma = await requirePrisma()
  const { page, pageSize, type, filter } = query

  const where: Prisma.NotificationWhereInput = { schoolId }
  if (type) where.type = type
  if (filter === "unread") {
    where.recipients = { some: { userId, readAt: null } }
  } else {
    where.recipients = { some: { userId } }
  }

  const [total, rows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      include: { recipients: { where: { userId }, select: { readAt: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const items: NotificationListItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkPath: row.linkPath,
    readAt: row.recipients[0]?.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
  return { items, total }
}

export async function getMyUnreadCount(schoolId: string, userId: string): Promise<UnreadNotificationCountResult> {
  const prisma = await requirePrisma()
  const total = await prisma.notificationRecipient.count({
    where: { userId, readAt: null, notification: { schoolId } },
  })
  return { total }
}

export async function markRead(
  id: string,
  schoolId: string,
  userId: string,
): Promise<{ id: string; readAt: string }> {
  const prisma = await requirePrisma()
  const recipient = await prisma.notificationRecipient.findFirst({
    where: { notificationId: id, userId, notification: { schoolId } },
    select: { readAt: true },
  })
  // Direct-ID access outside the caller's tenant/recipient scope resolves to
  // 404 so recipients can never enumerate each other's notifications.
  if (!recipient) throw notFoundError("Notification not found")

  if (recipient.readAt) return { id, readAt: recipient.readAt.toISOString() }
  const readAt = new Date()
  await prisma.notificationRecipient.updateMany({
    where: { notificationId: id, userId },
    data: { readAt },
  })
  return { id, readAt: readAt.toISOString() }
}

export async function markAllRead(schoolId: string, userId: string): Promise<{ updatedCount: number }> {
  const prisma = await requirePrisma()
  const result = await prisma.notificationRecipient.updateMany({
    where: { userId, readAt: null, notification: { schoolId } },
    data: { readAt: new Date() },
  })
  return { updatedCount: result.count }
}

export { resolveGuardianUserIds }