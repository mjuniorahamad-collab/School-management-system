import { Prisma } from "@prisma/client"
import { notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
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
  actorId: string,
): Promise<EventDetail> {
  const prisma = await requirePrisma()
  const created = await prisma.event.create({
    data: {
      schoolId,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? "GENERAL",
      status: input.status ?? "SCHEDULED",
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      location: input.location ?? null,
      createdBy: actorId,
    },
  })
  return toEventDetail(created)
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput,
  schoolId: string,
  actorId: string,
): Promise<EventDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.event.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!existing) throw notFoundError("Event not found")

  const data: Prisma.EventUncheckedUpdateInput = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description ?? null }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.startAt !== undefined && { startAt: new Date(input.startAt) }),
    ...(input.endAt !== undefined && { endAt: new Date(input.endAt) }),
    ...(input.location !== undefined && { location: input.location ?? null }),
    updatedBy: actorId,
  }

  const updated = await prisma.event.update({ where: { id }, data })
  return toEventDetail(updated)
}

export async function deleteEvent(id: string, schoolId: string): Promise<void> {
  const prisma = await requirePrisma()
  const event = await prisma.event.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!event) throw notFoundError("Event not found")
  await prisma.event.delete({ where: { id } })
}
