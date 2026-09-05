import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
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

export async function createClass(
  input: CreateClassInput,
  schoolId: string,
  actor: AuthUser,
): Promise<ClassDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.class.create({
        data: {
          schoolId,
          name: input.name,
          sortOrder: input.sortOrder ?? 0,
        },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "CLASS",
        entityId: row.id,
        summary: `Created class ${row.name}`,
        metadata: { sortOrder: row.sortOrder },
      })

      return row
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
  actor: AuthUser,
): Promise<ClassDetail> {
  const prisma = await requirePrisma()
  const existing = await getScopedClass(prisma, id, schoolId)
  if (!existing) throw notFoundError("Class not found")

  const data: Prisma.ClassUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.class.update({ where: { id }, data })

      const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
      if (input.name !== undefined && existing.name !== input.name) {
        diffFields.push({ field: "name", before: existing.name, after: input.name })
      }
      if (input.sortOrder !== undefined && existing.sortOrder !== input.sortOrder) {
        diffFields.push({ field: "sortOrder", before: existing.sortOrder, after: input.sortOrder })
      }

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "CLASS",
        entityId: id,
        summary: `Updated class ${existing.name}`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A class with this name already exists")
    }
    throw error
  }

  return getClassById(id, schoolId)
}
