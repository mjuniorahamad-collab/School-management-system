import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
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
  actor: AuthUser,
): Promise<SectionDetail> {
  const prisma = await requirePrisma()
  await resolveClass(prisma, schoolId, input.classId)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.section.create({
        data: { classId: input.classId, name: input.name },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "SECTION",
        entityId: row.id,
        summary: `Created section ${row.name}`,
        metadata: { classId: row.classId },
      })

      return row
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
  actor: AuthUser,
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

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.section.update({ where: { id }, data })

      const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
      if (input.name !== undefined && existing.name !== input.name) {
        diffFields.push({ field: "name", before: existing.name, after: input.name })
      }
      if (input.classId !== undefined && existing.classId !== input.classId) {
        diffFields.push({ field: "classId", before: existing.classId, after: input.classId })
      }

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "SECTION",
        entityId: id,
        summary: `Updated section ${existing.name}`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A section with this name already exists in the selected class")
    }
    throw error
  }

  return getSectionById(id, schoolId)
}
