import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import {
  FEE_STRUCTURE_DETAIL_INCLUDE,
  FEE_STRUCTURE_LIST_INCLUDE,
  mapFeeStructureDetail,
  mapFeeStructureListItem,
  type FeeStructureDetailRow,
  type FeeStructureListItemRow,
} from "./fee-structure.mapper.js"
import { assertItemsNonEmpty, assertUniqueFeeHeadIds, sumItemAmounts } from "./fee-structure.rules.js"
import type {
  CreateFeeStructureInput,
  FeeStructureItemInput,
  ListFeeStructuresQuery,
  UpdateFeeStructureInput,
} from "./fee-structure.schema.js"
import type { FeeStructureDetail, FeeStructureListResult } from "./fee-structure.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type Tx = Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

interface ResolvedScope {
  sessionId: string
  sessionEndDate: Date
  classId: string
}

async function resolveSessionAndClass(
  prisma: PrismaClient,
  schoolId: string,
  sessionId: string,
  classId: string,
): Promise<ResolvedScope> {
  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, schoolId },
    select: { id: true, endDate: true },
  })
  if (!session) throw badRequestError("Academic session is not valid for this school")

  const schoolClass = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true },
  })
  if (!schoolClass) throw badRequestError("Class is not valid for this school")

  return { sessionId: session.id, sessionEndDate: session.endDate, classId: schoolClass.id }
}

async function assertFeeHeadsBelongToSchool(
  prisma: PrismaClient,
  schoolId: string,
  items: readonly FeeStructureItemInput[],
): Promise<void> {
  const feeHeadIds = items.map((item) => item.feeHeadId)
  assertUniqueFeeHeadIds(feeHeadIds)
  assertItemsNonEmpty(feeHeadIds.length)

  const found = await prisma.feeHead.count({ where: { schoolId, id: { in: feeHeadIds } } })
  if (found !== feeHeadIds.length) {
    throw badRequestError("One or more fee heads are not valid for this school")
  }
}

function toItemRows(items: readonly FeeStructureItemInput[], dueDate: Date) {
  return items.map((item, index) => ({
    feeHeadId: item.feeHeadId,
    amount: item.amount,
    installmentNo: 1,
    dueDate,
    sortOrder: item.sortOrder ?? index,
  }))
}

function toUncheckedInput(input: UpdateFeeStructureInput) {
  const data: Prisma.FeeStructureUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.sessionId !== undefined) data.sessionId = input.sessionId
  if (input.classId !== undefined) data.classId = input.classId
  return data
}

export async function listFeeStructures(
  query: ListFeeStructuresQuery,
  schoolId: string,
): Promise<FeeStructureListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.FeeStructureWhereInput = { schoolId }
  if (query.sessionId) where.sessionId = query.sessionId
  if (query.classId) where.classId = query.classId
  if (query.isActive) where.isActive = query.isActive === "true"

  const search = query.search?.trim()
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { class: { name: { contains: search, mode: "insensitive" } } },
      { session: { name: { contains: search, mode: "insensitive" } } },
    ]
  }

  const orderBy: Prisma.FeeStructureOrderByWithRelationInput[] =
    query.sortBy === "name"
      ? [{ name: query.sortDir }]
      : [{ [query.sortBy]: query.sortDir }]

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.feeStructure.count({ where }),
    prisma.feeStructure.findMany({
      where,
      include: FEE_STRUCTURE_LIST_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows.map((row) => mapFeeStructureListItem(row as FeeStructureListItemRow)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getFeeStructureById(id: string, schoolId: string): Promise<FeeStructureDetail> {
  const prisma = await requirePrisma()
  const structure = await prisma.feeStructure.findFirst({
    where: { id, schoolId },
    include: FEE_STRUCTURE_DETAIL_INCLUDE,
  })
  if (!structure) throw notFoundError("Fee structure not found")
  return mapFeeStructureDetail(structure as FeeStructureDetailRow)
}

export async function createFeeStructure(
  input: CreateFeeStructureInput,
  schoolId: string,
  actor: AuthUser,
): Promise<FeeStructureDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  const resolved = await resolveSessionAndClass(prisma, schoolId, input.sessionId, input.classId)
  await assertFeeHeadsBelongToSchool(prisma, schoolId, input.items)

  const totalAmount = sumItemAmounts(input.items)
  const itemRows = toItemRows(input.items, resolved.sessionEndDate)

  try {
    let structureId = ""
    await prisma.$transaction(async (tx: Tx) => {
      const structure = await tx.feeStructure.create({
        data: {
          schoolId,
          sessionId: resolved.sessionId,
          classId: resolved.classId,
          name: input.name,
          isActive: input.isActive ?? true,
          totalAmount: 0,
        },
      })
      structureId = structure.id
      await tx.feeStructureItem.createMany({
        data: itemRows.map((item) => ({ ...item, feeStructureId: structure.id })),
      })
      await tx.feeStructure.update({ where: { id: structure.id }, data: { totalAmount } })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorEmail: auditActor.email,
        actorRole: auditActor.role,
        action: "CREATE",
        entityType: "FEE_STRUCTURE",
        entityId: structure.id,
        summary: `Created fee structure '${input.name}'`,
        metadata: {
          sessionId: resolved.sessionId,
          classId: resolved.classId,
          totalAmount,
          itemCount: input.items.length,
        },
      })
    })
    return getFeeStructureById(structureId, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A fee structure already exists for this academic session and class")
    }
    throw error
  }
}

export async function updateFeeStructure(
  id: string,
  input: UpdateFeeStructureInput,
  schoolId: string,
  actor: AuthUser,
): Promise<FeeStructureDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  const existing = await prisma.feeStructure.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, isActive: true, sessionId: true, classId: true },
  })
  if (!existing) throw notFoundError("Fee structure not found")

  const nextSessionId = input.sessionId ?? existing.sessionId
  const nextClassId = input.classId ?? existing.classId

  const data = toUncheckedInput(input)

  if (input.items) {
    await assertFeeHeadsBelongToSchool(prisma, schoolId, input.items)
    const resolved = await resolveSessionAndClass(prisma, schoolId, nextSessionId, nextClassId)
    data.sessionId = resolved.sessionId
    data.classId = resolved.classId

    const totalAmount = sumItemAmounts(input.items)
    const itemRows = toItemRows(input.items, resolved.sessionEndDate)
    const itemCount = input.items.length

    try {
      await prisma.$transaction(async (tx: Tx) => {
        await tx.feeStructureItem.deleteMany({ where: { feeStructureId: id } })
        await tx.feeStructureItem.createMany({
          data: itemRows.map((item) => ({ ...item, feeStructureId: id })),
        })
        await tx.feeStructure.update({ where: { id }, data: { ...data, totalAmount } })

        await recordAudit(tx, {
          schoolId,
          actorId: auditActor.id,
          actorName: auditActor.name,
          actorEmail: auditActor.email,
          actorRole: auditActor.role,
          action: "UPDATE",
          entityType: "FEE_STRUCTURE",
          entityId: id,
          summary: `Updated fee structure '${existing.name}'`,
          metadata: { sessionId: resolved.sessionId, classId: resolved.classId, totalAmount },
          diff: {
            fields: [
              ...(input.name !== undefined && input.name !== existing.name
                ? [{ field: "name", before: existing.name, after: input.name }]
                : []),
              ...(input.isActive !== undefined && input.isActive !== existing.isActive
                ? [{ field: "isActive", before: existing.isActive, after: input.isActive }]
                : []),
              ...(resolved.sessionId !== existing.sessionId
                ? [{ field: "sessionId", before: existing.sessionId, after: resolved.sessionId }]
                : []),
              ...(resolved.classId !== existing.classId
                ? [{ field: "classId", before: existing.classId, after: resolved.classId }]
                : []),
              { field: "items", before: null, after: `replaced with ${itemCount} items` },
            ],
          },
        })
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw badRequestError("A fee structure already exists for this academic session and class")
      }
      throw error
    }
  } else {
    if (input.sessionId !== undefined || input.classId !== undefined) {
      const resolved = await resolveSessionAndClass(prisma, schoolId, nextSessionId, nextClassId)
      data.sessionId = resolved.sessionId
      data.classId = resolved.classId
    }
    try {
      await prisma.$transaction(async (tx: Tx) => {
        await tx.feeStructure.update({ where: { id }, data })

        const diff = {
          fields: [
            ...(input.name !== undefined && input.name !== existing.name
              ? [{ field: "name", before: existing.name, after: input.name }]
              : []),
            ...(input.isActive !== undefined && input.isActive !== existing.isActive
              ? [{ field: "isActive", before: existing.isActive, after: input.isActive }]
              : []),
            ...(data.sessionId !== undefined && data.sessionId !== existing.sessionId
              ? [{ field: "sessionId", before: existing.sessionId, after: data.sessionId }]
              : []),
            ...(data.classId !== undefined && data.classId !== existing.classId
              ? [{ field: "classId", before: existing.classId, after: data.classId }]
              : []),
          ],
        }

        await recordAudit(tx, {
          schoolId,
          actorId: auditActor.id,
          actorName: auditActor.name,
          actorEmail: auditActor.email,
          actorRole: auditActor.role,
          action: "UPDATE",
          entityType: "FEE_STRUCTURE",
          entityId: id,
          summary: `Updated fee structure '${existing.name}'`,
          diff: diff.fields.length > 0 ? diff : null,
        })
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw badRequestError("A fee structure already exists for this academic session and class")
      }
      throw error
    }
  }

  return getFeeStructureById(id, schoolId)
}