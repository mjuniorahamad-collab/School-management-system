import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type {
  CreateGradingBandInput,
  ListGradingBandsQuery,
  UpdateGradingBandInput,
} from "./grading-band.schema.js"
import { toGradingBandDetail, toGradingBandListItem } from "./grading-band.mapper.js"
import type { GradingBandDetail, GradingBandListResult } from "./grading-band.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listGradingBands(
  query: ListGradingBandsQuery,
  schoolId: string,
): Promise<GradingBandListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.GradingBandWhereInput = { schoolId }
  if (query.search) {
    where.OR = [{ grade: { contains: query.search, mode: "insensitive" } }]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.gradingBand.count({ where }),
    prisma.gradingBand.findMany({
      where,
      orderBy: [{ minPercent: "desc" }, { sortOrder: "asc" }],
    }),
  ])

  return { items: rows.map(toGradingBandListItem), total }
}

export async function getGradingBandById(id: string, schoolId: string): Promise<GradingBandDetail> {
  const prisma = await requirePrisma()
  const band = await prisma.gradingBand.findFirst({ where: { id, schoolId } })
  if (!band) throw notFoundError("Grading band not found")
  return toGradingBandDetail(band)
}

export async function createGradingBand(
  input: CreateGradingBandInput,
  schoolId: string,
): Promise<GradingBandDetail> {
  const prisma = await requirePrisma()
  try {
    const created = await prisma.gradingBand.create({
      data: {
        schoolId,
        minPercent: input.minPercent,
        maxPercent: input.maxPercent,
        grade: input.grade.toUpperCase(),
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    return toGradingBandDetail(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A grading band already exists for this minimum percentage")
    }
    throw error
  }
}

export async function updateGradingBand(
  id: string,
  input: UpdateGradingBandInput,
  schoolId: string,
): Promise<GradingBandDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.gradingBand.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!existing) throw notFoundError("Grading band not found")

  const data: Prisma.GradingBandUncheckedUpdateInput = {}
  if (input.minPercent !== undefined) data.minPercent = input.minPercent
  if (input.maxPercent !== undefined) data.maxPercent = input.maxPercent
  if (input.grade !== undefined) data.grade = input.grade.toUpperCase()
  if (input.description !== undefined) data.description = input.description ?? null
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  try {
    const updated = await prisma.gradingBand.update({ where: { id }, data })
    return toGradingBandDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A grading band already exists for this minimum percentage")
    }
    throw error
  }
}
