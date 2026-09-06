import { Prisma } from "@prisma/client"
import type { ConversationRow } from "./message.mapper.js"
import { conversationInclude, toConversationDetail, toConversationListItem, toMessageListItem, toRecipientOption } from "./message.mapper.js"
import { buildDirectKey, GROUP_CONVERSATION_LIMIT, truncatePreview } from "./message.rules.js"
import type {
  AddParticipantsInput,
  CreateConversationInput,
  ListConversationsQuery,
  ListMessagesQuery,
  ListRecipientsQuery,
  SendMessageInput,
} from "./message.schema.js"
import type {
  ConversationDetail,
  ConversationListResult,
  MessageListResult,
  RecipientOption,
  UnreadCountResult,
} from "./message.types.js"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

interface ResolvedRecipient {
  userId: string
  name: string
  email: string
  roleName: string
}

function messageNotParticipantError(): never {
  throw notFoundError("Conversation not found")
}

/**
 * Loads a conversation only when it lives in the caller's school and the caller
 * is a participant. Any other combination (cross-tenant ID, direct-ID guess,
 * non-participant) resolves to 404 so tenants can never enumerate each other's
 * threads.
 */
async function findConversationFor(
  prisma: PrismaClient,
  schoolId: string,
  id: string,
  userId: string,
): Promise<ConversationRow | null> {
  return prisma.conversation.findFirst({
    where: { id, schoolId, participants: { some: { userId } } },
    include: conversationInclude,
  })
}

/**
 * Resolves direct recipient IDs and/or role targets into concrete tenant user
 * accounts. Every target must be an ACTIVE membership in THIS school whose role
 * carries `messages:view` and whose account is ACTIVE. Invalid, foreign-school,
 * or unmessagable targets fail loudly so typos never silently drop people.
 * The sender cannot be a target (they are always auto-added as a participant).
 */
async function resolveRecipients(
  prisma: PrismaClient,
  schoolId: string,
  recipientIds: string[] | undefined,
  roleNames: string[] | undefined,
  actorId: string,
): Promise<ResolvedRecipient[]> {
  const resolved = new Map<string, ResolvedRecipient>()

  if (recipientIds && recipientIds.length > 0) {
    const memberships = await prisma.tenantMembership.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        userId: { in: recipientIds, not: actorId },
        user: { status: "ACTIVE" },
        role: { rolePermissions: { some: { permission: { code: "messages:view" } } } },
      },
      include: { user: { select: { id: true, name: true, email: true } }, role: { select: { name: true } } },
    })
    if (memberships.length !== recipientIds.length) {
      throw badRequestError("One or more recipients cannot be messaged")
    }
    for (const membership of memberships) {
      resolved.set(membership.userId, {
        userId: membership.userId,
        name: membership.user.name,
        email: membership.user.email,
        roleName: membership.role.name,
      })
    }
  }

  if (roleNames && roleNames.length > 0) {
    const memberships = await prisma.tenantMembership.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        userId: { not: actorId },
        user: { status: "ACTIVE" },
        role: {
          name: { in: roleNames },
          rolePermissions: { some: { permission: { code: "messages:view" } } },
        },
      },
      include: { user: { select: { id: true, name: true, email: true } }, role: { select: { name: true } } },
    })
    const foundRoleNames = new Set(memberships.map((membership) => membership.role.name))
    const missingRoles = roleNames.filter((roleName) => !foundRoleNames.has(roleName))
    if (missingRoles.length > 0) {
      throw badRequestError("One or more role targets are not messagable roles", { roles: missingRoles })
    }
    for (const membership of memberships) {
      if (!resolved.has(membership.userId)) {
        resolved.set(membership.userId, {
          userId: membership.userId,
          name: membership.user.name,
          email: membership.user.email,
          roleName: membership.role.name,
        })
      }
    }
  }

  return [...resolved.values()]
}

/** Number of messages newer than the participant's read cursor, sent by others. */
async function unreadCountFor(
  prisma: PrismaClient,
  conversationId: string,
  participant: ConversationRow["participants"][number] | undefined,
  userId: string,
): Promise<number> {
  if (!participant) return 0
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      createdAt: participant.lastReadAt ? { gt: participant.lastReadAt } : undefined,
    },
  })
}

async function actorSelfRecipient(prisma: PrismaClient, schoolId: string, actor: AuthUser): Promise<ResolvedRecipient> {
  const membership = await prisma.tenantMembership.findFirst({
    where: { schoolId, userId: actor.id, status: "ACTIVE" },
    include: { role: { select: { name: true } } },
  })
  return {
    userId: actor.id,
    name: actor.name,
    email: actor.email,
    roleName: membership?.role.name ?? actor.roles[0] ?? "USER",
  }
}

async function auditActor(prisma: PrismaClient, schoolId: string, actor: AuthUser) {
  return resolveAuditActor(prisma, schoolId, actor)
}

async function createConversationRows(
  prisma: PrismaClient,
  schoolId: string,
  actor: AuthUser,
  input: {
    type: "DIRECT" | "GROUP"
    title?: string
    directKey?: string
    recipients: ResolvedRecipient[]
  },
  metadata: { type: string; participantCount: number; roleTargets?: string[] },
): Promise<ConversationRow> {
  const actorRecipient = await actorSelfRecipient(prisma, schoolId, actor)
  const participants = [actorRecipient, ...input.recipients]

  const created = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        schoolId,
        type: input.type,
        title: input.title ?? null,
        directKey: input.directKey ?? null,
        createdBy: actor.id,
      },
    })
    await tx.conversationParticipant.createMany({
      data: participants.map((participant) => ({
        conversationId: conversation.id,
        userId: participant.userId,
        role: participant.roleName,
      })),
    })
    const resolvedActor = await auditActor(prisma, schoolId, actor)
    await recordAudit(tx, {
      schoolId,
      actorId: resolvedActor.id,
      actorName: resolvedActor.name,
      actorRole: resolvedActor.role,
      actorEmail: resolvedActor.email,
      action: "CREATE",
      entityType: "CONVERSATION",
      entityId: conversation.id,
      summary: `Created a ${input.type === "DIRECT" ? "direct" : "group"} conversation (${participants.length} participants)`,
      metadata,
    })
    const row = await tx.conversation.findUnique({
      where: { id: conversation.id },
      include: conversationInclude,
    })
    if (!row) throw new Error("Conversation was not created")
    return row
  })
  return created
}

export async function listConversations(
  query: ListConversationsQuery,
  schoolId: string,
  userId: string,
): Promise<ConversationListResult> {
  const prisma = await requirePrisma()
  const { page, pageSize } = query
  const where: Prisma.ConversationWhereInput = {
    schoolId,
    participants: { some: { userId, isArchived: false } },
  }

  const [total, rows] = await prisma.$transaction([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const items = await Promise.all(
    rows.map(async (conversation) => {
      const mine = conversation.participants.find((participant) => participant.userId === userId)
      const unread = await unreadCountFor(prisma, conversation.id, mine, userId)
      return toConversationListItem(conversation, unread)
    }),
  )
  return { items, total }
}

export async function getConversation(id: string, schoolId: string, userId: string): Promise<ConversationDetail> {
  const prisma = await requirePrisma()
  const conversation = await findConversationFor(prisma, schoolId, id, userId)
  if (!conversation) messageNotParticipantError()
  const mine = conversation.participants.find((participant) => participant.userId === userId)
  const unread = await unreadCountFor(prisma, conversation.id, mine, userId)
  return toConversationDetail(conversation, unread)
}

export async function listMessages(
  id: string,
  query: ListMessagesQuery,
  schoolId: string,
  userId: string,
): Promise<MessageListResult> {
  const prisma = await requirePrisma()
  const conversation = await findConversationFor(prisma, schoolId, id, userId)
  if (!conversation) messageNotParticipantError()
  const { page, pageSize, before } = query

  const where: Prisma.MessageWhereInput = { conversationId: id, schoolId }
  if (before) {
    where.createdAt = { lt: new Date(before) }
  }

  const [total, rows] = await prisma.$transaction([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return { items: rows.map(toMessageListItem), total }
}

export async function createDirectConversation(
  input: CreateConversationInput,
  schoolId: string,
  actor: AuthUser,
): Promise<ConversationDetail> {
  const prisma = await requirePrisma()
  const recipientIds = input.recipientIds ?? []
  if (recipientIds.length !== 1) {
    throw badRequestError("A direct conversation needs exactly one recipient")
  }
  const recipients = await resolveRecipients(prisma, schoolId, recipientIds, undefined, actor.id)
  const recipient = recipients[0]
  const directKey = buildDirectKey(actor.id, recipient.userId)

  const existing = await prisma.conversation.findFirst({ where: { directKey, schoolId }, include: conversationInclude })
  if (existing) {
    const mine = existing.participants.find((participant) => participant.userId === actor.id)
    const unread = await unreadCountFor(prisma, existing.id, mine, actor.id)
    return toConversationDetail(existing, unread)
  }

  const created = await createConversationRows(
    prisma,
    schoolId,
    actor,
    { type: "DIRECT", recipients: [recipient], directKey },
    { type: "DIRECT", participantCount: 2 },
  )
  const unread = 0
  return toConversationDetail(created, unread)
}

export async function createGroupConversation(
  input: CreateConversationInput,
  schoolId: string,
  actor: AuthUser,
): Promise<ConversationDetail> {
  const prisma = await requirePrisma()
  if (input.type !== "GROUP" || !input.title) {
    throw badRequestError("A group conversation needs a title")
  }
  const recipients = await resolveRecipients(prisma, schoolId, input.recipientIds, input.roleNames, actor.id)
  if (recipients.length === 0) {
    throw badRequestError("A group conversation needs at least one recipient or role target")
  }
  if (recipients.length + 1 > GROUP_CONVERSATION_LIMIT) {
    throw badRequestError(`A group conversation can hold at most ${GROUP_CONVERSATION_LIMIT} participants`)
  }

  const created = await createConversationRows(
    prisma,
    schoolId,
    actor,
    { type: "GROUP", title: input.title, recipients },
    {
      type: "GROUP",
      participantCount: recipients.length + 1,
      ...(input.roleNames && input.roleNames.length > 0 ? { roleTargets: input.roleNames } : {}),
    },
  )
  return toConversationDetail(created, 0)
}

export async function sendMessage(
  conversationId: string,
  input: SendMessageInput,
  schoolId: string,
  actor: AuthUser,
) {
  const prisma = await requirePrisma()
  const conversation = await findConversationFor(prisma, schoolId, conversationId, actor.id)
  if (!conversation) messageNotParticipantError()

  const sentAt = new Date()
  const message = await prisma.$transaction(async (tx) => {
    const row = await tx.message.create({
      data: {
        schoolId,
        conversationId,
        senderId: actor.id,
        body: input.body,
      },
      include: { sender: { select: { id: true, name: true } } },
    })
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: sentAt,
        lastMessagePreview: truncatePreview(input.body),
        lastMessageSenderId: actor.id,
      },
    })
    return row
  })
  return toMessageListItem(message)
}

export async function markConversationRead(id: string, schoolId: string, userId: string) {
  const prisma = await requirePrisma()
  const conversation = await findConversationFor(prisma, schoolId, id, userId)
  if (!conversation) messageNotParticipantError()
  const readAt = new Date()
  await prisma.conversationParticipant.updateMany({
    where: { conversationId: id, userId },
    data: { lastReadAt: readAt },
  })
  return { conversationId: id, readAt: readAt.toISOString() }
}

export async function archiveConversation(id: string, schoolId: string, actor: AuthUser) {
  const prisma = await requirePrisma()
  const conversation = await findConversationFor(prisma, schoolId, id, actor.id)
  if (!conversation) messageNotParticipantError()
  const archivedAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.conversationParticipant.updateMany({
      where: { conversationId: id, userId: actor.id, isArchived: false },
      data: { isArchived: true, archivedAt },
    })
    const resolvedActor = await auditActor(prisma, schoolId, actor)
    await recordAudit(tx, {
      schoolId,
      actorId: resolvedActor.id,
      actorName: resolvedActor.name,
      actorRole: resolvedActor.role,
      actorEmail: resolvedActor.email,
      action: "ARCHIVE",
      entityType: "CONVERSATION",
      entityId: id,
      summary: `Archived conversation for ${actor.name}`,
      metadata: { actorId: actor.id },
    })
  })
  return { conversationId: id, archivedAt: archivedAt.toISOString() }
}

export async function addParticipants(
  id: string,
  input: AddParticipantsInput,
  schoolId: string,
  actor: AuthUser,
): Promise<ConversationDetail> {
  const prisma = await requirePrisma()
  const conversation = await findConversationFor(prisma, schoolId, id, actor.id)
  if (!conversation) messageNotParticipantError()
  if (conversation.type !== "GROUP") {
    throw badRequestError("Participants can only be added to group conversations")
  }

  const existingUserIds = new Set(conversation.participants.map((participant) => participant.userId))
  const targets = (await resolveRecipients(prisma, schoolId, input.recipientIds, input.roleNames, actor.id)).filter(
    (target) => !existingUserIds.has(target.userId),
  )
  if (targets.length === 0) {
    throw badRequestError("No new participants to add")
  }
  if (existingUserIds.size + targets.length > GROUP_CONVERSATION_LIMIT) {
    throw badRequestError(`A group conversation can hold at most ${GROUP_CONVERSATION_LIMIT} participants`)
  }

  const resolvedActor = await auditActor(prisma, schoolId, actor)
  const updated = await prisma.$transaction(async (tx) => {
    for (const target of targets) {
      const participant = await tx.conversationParticipant.create({
        data: { conversationId: id, userId: target.userId, role: target.roleName },
      })
      await recordAudit(tx, {
        schoolId,
        actorId: resolvedActor.id,
        actorName: resolvedActor.name,
        actorRole: resolvedActor.role,
        actorEmail: resolvedActor.email,
        action: "CREATE",
        entityType: "CONVERSATION_PARTICIPANT",
        entityId: participant.id,
        summary: `Added ${target.name} to a conversation`,
        metadata: { conversationId: id },
      })
    }
    const row = await tx.conversation.findUnique({ where: { id }, include: conversationInclude })
    if (!row) throw new Error("Conversation was not found")
    return row
  })

  const mine = updated.participants.find((participant) => participant.userId === actor.id)
  const unread = await unreadCountFor(prisma, updated.id, mine, actor.id)
  return toConversationDetail(updated, unread)
}

export async function listRecipients(
  query: ListRecipientsQuery,
  schoolId: string,
  userId: string,
): Promise<RecipientOption[]> {
  const prisma = await requirePrisma()
  const userFilter: Prisma.UserWhereInput = { status: "ACTIVE" }
  if (query.search) {
    userFilter.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
    ]
  }

  const rows = await prisma.tenantMembership.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      userId: { not: userId },
      user: userFilter,
      role: {
        ...(query.roleNames && query.roleNames.length > 0 ? { name: { in: query.roleNames } } : {}),
        rolePermissions: { some: { permission: { code: "messages:view" } } },
      },
    },
    include: { user: { select: { id: true, name: true, email: true } }, role: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
    take: query.limit,
  })
  return rows.map(toRecipientOption)
}

export async function getUnreadCount(schoolId: string, userId: string): Promise<UnreadCountResult> {
  const prisma = await requirePrisma()
  const participants = await prisma.conversationParticipant.findMany({
    where: { userId, isArchived: false },
    select: { conversationId: true, lastReadAt: true },
  })
  if (participants.length === 0) return { total: 0 }
  const counts = await Promise.all(
    participants.map((participant) =>
      prisma.message.count({
        where: {
          conversationId: participant.conversationId,
          schoolId,
          senderId: { not: userId },
          createdAt: participant.lastReadAt ? { gt: participant.lastReadAt } : undefined,
        },
      }),
    ),
  )
  return { total: counts.reduce((sum, count) => sum + count, 0) }
}