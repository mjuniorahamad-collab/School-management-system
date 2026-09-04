import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { normalizeExamTypeCode } from "./exam-type.rules.js"
import type {
  CreateExamTypeInput,
  ListExamTypesQuery,
  UpdateExamTypeInput,
} from "./exam-type.schema.js"
import { toExamTypeDetail, toExamTypeListItem } from "./exam-type.mapper.js"
import type { ExamTypeDetail, ExamTypeListResult } from "./exam-type.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listExamTypes(
  query: ListExamTypesQuery,
  schoolId: string,
): Promise<ExamTypeListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.ExamTypeWhereInput = { schoolId }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.examType.count({ where }),
    prisma.examType.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ])

  return { items: rows.map(toExamTypeListItem), total }
}

export async function getExamTypeById(id: string, schoolId: string): Promise<ExamTypeDetail> {
  const prisma = await requirePrisma()
  const examType = await prisma.examType.findFirst({ where: { id, schoolId } })
  if (!examType) throw notFoundError("Exam type not found")
  return toExamTypeDetail(examType)
}

export async function createExamType(
  input: CreateExamTypeInput,
  schoolId: string,
): Promise<ExamTypeDetail> {
  const prisma = await requirePrisma()
  try {
    const created = await prisma.examType.create({
      data: {
        schoolId,
        code: normalizeExamTypeCode(input.code),
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    return toExamTypeDetail(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("An exam type with this code already exists")
    }
    throw error
  }
}

export async function updateExamType(
  id: string,
  input: UpdateExamTypeInput,
  schoolId: string,
): Promise<ExamTypeDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.examType.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!existing) throw notFoundError("Exam type not found")

  const data: Prisma.ExamTypeUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.code !== undefined) data.code = normalizeExamTypeCode(input.code)
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  try {
    const updated = await prisma.examType.update({ where: { id }, data })
    return toExamTypeDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("An exam type with this code already exists")
    }
    throw error
  }
}
