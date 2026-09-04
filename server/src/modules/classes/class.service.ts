import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { CreateClassInput, ListClassesQuery, UpdateClassInput } from "./class.schema.js"
import { toClassDetail, toClassListItem, type ClassRow } from "./class.mapper.js"
import type { ClassDetail, ClassListResult } from "./class.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

async function getScopedClass(prisma: PrismaClient, id: string, schoolId: string) {
  return prisma.class.findFirst({
    where: { id, schoolId },
    include: { _count: { select: { sections: true, enrollments: true } } },
  })
}

export async function listClasses(
  query: ListClassesQuery,
  schoolId: string,
): Promise<ClassListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.ClassWhereInput = { schoolId }
  if (query.search) {
    where.OR = [{ name: { contains: query.search, mode: "insensitive" } }]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.class.count({ where }),
    prisma.class.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { sections: true, enrollments: true } } },
    }),
  ])

  return {
    items: rows.map((row) => toClassListItem(row as ClassRow)),
    total,
  }
}

export async function getClassById(id: string, schoolId: string): Promise<ClassDetail> {
  const prisma = await requirePrisma()
  const row = await prisma.class.findFirst({
    where: { id, schoolId },
    include: {
      sections: { orderBy: { name: "asc" } },
      _count: { select: { sections: true, enrollments: true } },
    },
  })
  if (!row) throw notFoundError("Class not found")
  return toClassDetail(row as ClassRow)
}

export async function createClass(input: CreateClassInput, schoolId: string): Promise<ClassDetail> {
  const prisma = await requirePrisma()
  try {
    const created = await prisma.class.create({
      data: {
        schoolId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    return getClassById(created.id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A class with this name already exists")
    }
    throw error
  }
}

export async function updateClass(
  id: string,
  input: UpdateClassInput,
  schoolId: string,
): Promise<ClassDetail> {
  const prisma = await requirePrisma()
  const existing = await getScopedClass(prisma, id, schoolId)
  if (!existing) throw notFoundError("Class not found")

  const data: Prisma.ClassUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  try {
    await prisma.class.update({ where: { id }, data })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A class with this name already exists")
    }
    throw error
  }

  return getClassById(id, schoolId)
}
