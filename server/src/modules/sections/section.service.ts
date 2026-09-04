import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type {
  CreateSectionInput,
  ListSectionsQuery,
  UpdateSectionInput,
} from "./section.schema.js"
import { toSectionDetail, toSectionListItem, type SectionRow } from "./section.mapper.js"
import type { SectionDetail, SectionListResult } from "./section.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

/** Verifies the class exists and belongs to the school, returning its id. */
async function resolveClass(prisma: PrismaClient, schoolId: string, classId: string): Promise<void> {
  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } })
  if (!cls) throw badRequestError("Class is not valid for this school")
}

async function getScopedSection(prisma: PrismaClient, id: string, schoolId: string) {
  const section = await prisma.section.findFirst({
    where: { id },
    include: { class: true, _count: { select: { enrollments: true } } },
  })
  if (!section || section.class.schoolId !== schoolId) return null
  return section
}

export async function listSections(
  query: ListSectionsQuery,
  schoolId: string,
): Promise<SectionListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.SectionWhereInput = { class: { schoolId } }
  if (query.classId) {
    const cls = await prisma.class.findFirst({ where: { id: query.classId, schoolId }, select: { id: true } })
    if (!cls) throw badRequestError("Class is not valid for this school")
    where.classId = query.classId
  }
  if (query.search) {
    where.AND = [{ name: { contains: query.search, mode: "insensitive" } }]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.section.count({ where }),
    prisma.section.findMany({
      where,
      orderBy: [{ class: { sortOrder: "asc" } }, { name: "asc" }],
      include: { class: true, _count: { select: { enrollments: true } } },
    }),
  ])

  return {
    items: rows.map((row) => toSectionListItem(row as SectionRow)),
    total,
  }
}

export async function getSectionById(id: string, schoolId: string): Promise<SectionDetail> {
  const prisma = await requirePrisma()
  const section = await getScopedSection(prisma, id, schoolId)
  if (!section) throw notFoundError("Section not found")
  return toSectionDetail(section as SectionRow)
}

export async function createSection(
  input: CreateSectionInput,
  schoolId: string,
): Promise<SectionDetail> {
  const prisma = await requirePrisma()
  await resolveClass(prisma, schoolId, input.classId)

  try {
    const created = await prisma.section.create({
      data: { classId: input.classId, name: input.name },
    })
    return getSectionById(created.id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A section with this name already exists in the selected class")
    }
    throw error
  }
}

export async function updateSection(
  id: string,
  input: UpdateSectionInput,
  schoolId: string,
): Promise<SectionDetail> {
  const prisma = await requirePrisma()
  const existing = await getScopedSection(prisma, id, schoolId)
  if (!existing) throw notFoundError("Section not found")

  const data: Prisma.SectionUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.classId !== undefined) {
    await resolveClass(prisma, schoolId, input.classId)
    data.classId = input.classId
  }

  try {
    await prisma.section.update({ where: { id }, data })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A section with this name already exists in the selected class")
    }
    throw error
  }

  return getSectionById(id, schoolId)
}
