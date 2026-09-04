import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { normalizeFeeHeadCode } from "./fee-head.rules.js"
import type {
  CreateFeeHeadInput,
  ListFeeHeadsQuery,
  UpdateFeeHeadInput,
} from "./fee-head.schema.js"
import { toFeeHeadDetail, toFeeHeadListItem } from "./fee-head.mapper.js"
import type { FeeHeadDetail, FeeHeadListResult } from "./fee-head.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listFeeHeads(
  query: ListFeeHeadsQuery,
  schoolId: string,
): Promise<FeeHeadListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.FeeHeadWhereInput = { schoolId }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.feeHead.count({ where }),
    prisma.feeHead.findMany({ where, orderBy: [{ name: "asc" }] }),
  ])

  return { items: rows.map(toFeeHeadListItem), total }
}

export async function getFeeHeadById(id: string, schoolId: string): Promise<FeeHeadDetail> {
  const prisma = await requirePrisma()
  const feeHead = await prisma.feeHead.findFirst({ where: { id, schoolId } })
  if (!feeHead) throw notFoundError("Fee head not found")
  return toFeeHeadDetail(feeHead)
}

export async function createFeeHead(
  input: CreateFeeHeadInput,
  schoolId: string,
): Promise<FeeHeadDetail> {
  const prisma = await requirePrisma()
  try {
    const created = await prisma.feeHead.create({
      data: {
        schoolId,
        code: normalizeFeeHeadCode(input.code),
        name: input.name,
        isRecurring: input.isRecurring ?? false,
      },
    })
    return toFeeHeadDetail(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A fee head with this code already exists")
    }
    throw error
  }
}

export async function updateFeeHead(
  id: string,
  input: UpdateFeeHeadInput,
  schoolId: string,
): Promise<FeeHeadDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.feeHead.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!existing) throw notFoundError("Fee head not found")

  const data: Prisma.FeeHeadUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.code !== undefined) data.code = normalizeFeeHeadCode(input.code)
  if (input.isRecurring !== undefined) data.isRecurring = input.isRecurring

  try {
    const updated = await prisma.feeHead.update({ where: { id }, data })
    return toFeeHeadDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A fee head with this code already exists")
    }
    throw error
  }
}
