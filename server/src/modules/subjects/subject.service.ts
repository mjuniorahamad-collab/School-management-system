import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { normalizeSubjectCode } from "./subject.rules.js"
import type { CreateSubjectInput, ListSubjectsQuery, UpdateSubjectInput } from "./subject.schema.js"
import { toSubjectDetail, toSubjectListItem } from "./subject.mapper.js"
import type { SubjectDetail, SubjectListResult } from "./subject.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listSubjects(
  query: ListSubjectsQuery,
  schoolId: string,
): Promise<SubjectListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.SubjectWhereInput = { schoolId }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.subject.count({ where }),
    prisma.subject.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ])

  return {
    items: rows.map(toSubjectListItem),
    total,
  }
}

export async function getSubjectById(id: string, schoolId: string): Promise<SubjectDetail> {
  const prisma = await requirePrisma()
  const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
  if (!subject) throw notFoundError("Subject not found")
  return toSubjectDetail(subject)
}

export async function createSubject(
  input: CreateSubjectInput,
  schoolId: string,
  actor: AuthUser,
): Promise<SubjectDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.subject.create({
        data: {
          schoolId,
          code: normalizeSubjectCode(input.code),
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
        entityType: "SUBJECT",
        entityId: row.id,
        summary: `Created subject ${row.name}`,
      })

      return row
    })
    return toSubjectDetail(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A subject with this code already exists")
    }
    throw error
  }
}

export async function updateSubject(
  id: string,
  input: UpdateSubjectInput,
  schoolId: string,
  actor: AuthUser,
): Promise<SubjectDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.subject.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, code: true, sortOrder: true },
  })
  if (!existing) throw notFoundError("Subject not found")

  const data: Prisma.SubjectUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.code !== undefined) data.code = normalizeSubjectCode(input.code)
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.subject.update({ where: { id }, data })

      const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
      if (input.name !== undefined && existing.name !== input.name) {
        diffFields.push({ field: "name", before: existing.name, after: input.name })
      }
      if (input.code !== undefined && existing.code !== normalizeSubjectCode(input.code)) {
        diffFields.push({ field: "code", before: existing.code, after: normalizeSubjectCode(input.code) })
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
        entityType: "SUBJECT",
        entityId: id,
        summary: `Updated subject ${existing.name}`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })

      return row
    })
    return toSubjectDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A subject with this code already exists")
    }
    throw error
  }
}
