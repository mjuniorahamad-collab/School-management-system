import { Prisma } from "@prisma/client"
import type { Event } from "@prisma/client"
import { notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { CreateEventInput, ListEventsQuery, UpdateEventInput } from "./event.schema.js"
import { toEventDetail, toEventListItem } from "./event.mapper.js"
import type { EventDetail, EventListResult } from "./event.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listEvents(
  query: ListEventsQuery,
  schoolId: string,
): Promise<EventListResult> {
  const prisma = await requirePrisma()
  const { page, pageSize } = query

  const where: Prisma.EventWhereInput = { schoolId }
  if (query.category) where.category = query.category
  if (query.status) where.status = query.status
  if (query.search) where.title = { contains: query.search, mode: "insensitive" }
  if (query.from || query.to) {
    where.AND = []
    if (query.from) where.AND.push({ endAt: { gte: new Date(`${query.from}T00:00:00.000Z`) } })
    if (query.to) where.AND.push({ startAt: { lte: new Date(`${query.to}T23:59:59.999Z`) } })
  }

  const [total, rows] = await prisma.$transaction([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: [{ startAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { items: rows.map(toEventListItem), total }
}

export async function getEventById(id: string, schoolId: string): Promise<EventDetail> {
  const prisma = await requirePrisma()
  const event = await prisma.event.findFirst({ where: { id, schoolId } })
  if (!event) throw notFoundError("Event not found")
  return toEventDetail(event)
}

export async function createEvent(
  input: CreateEventInput,
  schoolId: string,
  actor: AuthUser,
): Promise<EventDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.event.create({
      data: {
        schoolId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? "GENERAL",
        status: input.status ?? "SCHEDULED",
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        location: input.location ?? null,
        createdBy: actor.id,
      },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "CREATE",
      entityType: "EVENT",
      entityId: row.id,
      summary: `Created event "${row.title}"`,
      metadata: { category: row.category, status: row.status },
    })

    return row
  })
  return toEventDetail(created)
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput,
  schoolId: string,
  actor: AuthUser,
): Promise<EventDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.event.findFirst({
    where: { id, schoolId },
    select: { id: true, title: true, status: true },
  })
  if (!existing) throw notFoundError("Event not found")

  const data: Prisma.EventUncheckedUpdateInput = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description ?? null }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.startAt !== undefined && { startAt: new Date(input.startAt) }),
    ...(input.endAt !== undefined && { endAt: new Date(input.endAt) }),
    ...(input.location !== undefined && { location: input.location ?? null }),
    updatedBy: actor.id,
  }

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  const nextStatus = (input.status ?? existing.status) as Event["status"]

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.event.update({ where: { id }, data })

    const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
    if (input.status !== undefined && existing.status !== nextStatus) {
      diffFields.push({ field: "status", before: existing.status, after: nextStatus })
    }
    if (input.title !== undefined && existing.title !== input.title) {
      diffFields.push({ field: "title", before: existing.title, after: input.title })
    }

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: input.status !== undefined ? "STATUS_CHANGE" : "UPDATE",
      entityType: "EVENT",
      entityId: id,
      summary:
        input.status !== undefined
          ? `Changed event status to ${nextStatus}`
          : `Updated event "${existing.title}"`,
      diff: diffFields.length > 0 ? { fields: diffFields } : null,
    })

    return row
  })
  return toEventDetail(updated)
}

export async function deleteEvent(id: string, schoolId: string, actor: AuthUser): Promise<void> {
  const prisma = await requirePrisma()
  const event = await prisma.event.findFirst({ where: { id, schoolId }, select: { id: true, title: true } })
  if (!event) throw notFoundError("Event not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  await prisma.$transaction(async (tx) => {
    await tx.event.delete({ where: { id } })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "DELETE",
      entityType: "EVENT",
      entityId: id,
      summary: `Deleted event "${event.title}"`,
    })
  })
}
