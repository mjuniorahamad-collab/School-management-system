import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type {
  CreatePeriodSlotInput,
  ListPeriodSlotsQuery,
  UpdatePeriodSlotInput,
} from "./period-slot.schema.js"
import { toPeriodSlotDetail, toPeriodSlotListItem } from "./period-slot.mapper.js"
import type { PeriodSlotDetail, PeriodSlotListResult } from "./period-slot.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listPeriodSlots(
  query: ListPeriodSlotsQuery,
  schoolId: string,
): Promise<PeriodSlotListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.PeriodSlotWhereInput = { schoolId }
  if (query.search) {
    where.name = { contains: query.search, mode: "insensitive" }
  }

  const [total, rows] = await prisma.$transaction([
    prisma.periodSlot.count({ where }),
    prisma.periodSlot.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ])

  return { items: rows.map(toPeriodSlotListItem), total }
}

export async function getPeriodSlotById(id: string, schoolId: string): Promise<PeriodSlotDetail> {
  const prisma = await requirePrisma()
  const periodSlot = await prisma.periodSlot.findFirst({ where: { id, schoolId } })
  if (!periodSlot) throw notFoundError("Period not found")
  return toPeriodSlotDetail(periodSlot)
}

export async function createPeriodSlot(
  input: CreatePeriodSlotInput,
  schoolId: string,
): Promise<PeriodSlotDetail> {
  const prisma = await requirePrisma()
  try {
    const created = await prisma.periodSlot.create({
      data: {
        schoolId,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    return toPeriodSlotDetail(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A period with this name already exists")
    }
    throw error
  }
}

export async function updatePeriodSlot(
  id: string,
  input: UpdatePeriodSlotInput,
  schoolId: string,
): Promise<PeriodSlotDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.periodSlot.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!existing) throw notFoundError("Period not found")

  const data: Prisma.PeriodSlotUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.startTime !== undefined) data.startTime = input.startTime
  if (input.endTime !== undefined) data.endTime = input.endTime
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  try {
    const updated = await prisma.periodSlot.update({ where: { id }, data })
    return toPeriodSlotDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A period with this name already exists")
    }
    throw error
  }
}
