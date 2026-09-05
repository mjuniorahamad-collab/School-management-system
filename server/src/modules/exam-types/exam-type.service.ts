import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
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
  actor: AuthUser,
): Promise<ExamTypeDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.examType.create({
        data: {
          schoolId,
          code: normalizeExamTypeCode(input.code),
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
        entityType: "EXAM_TYPE",
        entityId: row.id,
        summary: `Created exam type ${row.name}`,
      })

      return row
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
  actor: AuthUser,
): Promise<ExamTypeDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.examType.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, code: true, sortOrder: true },
  })
  if (!existing) throw notFoundError("Exam type not found")

  const data: Prisma.ExamTypeUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.code !== undefined) data.code = normalizeExamTypeCode(input.code)
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.examType.update({ where: { id }, data })

      const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
      if (input.name !== undefined && existing.name !== input.name) {
        diffFields.push({ field: "name", before: existing.name, after: input.name })
      }
      if (input.code !== undefined && existing.code !== normalizeExamTypeCode(input.code)) {
        diffFields.push({ field: "code", before: existing.code, after: normalizeExamTypeCode(input.code) })
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
        entityType: "EXAM_TYPE",
        entityId: id,
        summary: `Updated exam type ${existing.name}`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })

      return row
    })
    return toExamTypeDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("An exam type with this code already exists")
    }
    throw error
  }
}
