import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type {
  CreateGradingBandInput,
  ListGradingBandsQuery,
  UpdateGradingBandInput,
} from "./grading-band.schema.js"
import { toGradingBandDetail, toGradingBandListItem } from "./grading-band.mapper.js"
import { lockActiveGradingBands } from "./grading-band.lock.js"
import { assertBandRange } from "./grading-band.rules.js"
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
  if (!query.includeInactive) {
    where.isActive = true
  }
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
  actor: AuthUser,
): Promise<GradingBandDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  try {
    const created = await prisma.$transaction(async (tx) => {
      // A band created as INACTIVE is a retired band: it is not part of the
      // active scale, so it must not be rejected for overlapping an active
      // band. Only a band that joins the active scale is overlap-checked.
      const isActive = input.isActive ?? true
      if (isActive) {
        // The overlap check is a read-then-write sequence, so it is serialized
        // per school: the lock is taken BEFORE the active bands are read.
        await lockActiveGradingBands(tx, schoolId)
        await assertNoActiveOverlap(tx, schoolId, input.minPercent, input.maxPercent)
      }
      const row = await tx.gradingBand.create({
        data: {
          schoolId,
          minPercent: input.minPercent,
          maxPercent: input.maxPercent,
          grade: input.grade.toUpperCase(),
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive,
        },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "GRADING_BAND",
        entityId: row.id,
        summary: `Created grading band ${row.grade}`,
        metadata: { isActive: row.isActive },
      })

      return row
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
  actor: AuthUser,
): Promise<GradingBandDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.gradingBand.findFirst({
    where: { id, schoolId },
    select: { id: true, minPercent: true, maxPercent: true, grade: true, description: true, sortOrder: true, isActive: true },
  })
  if (!existing) throw notFoundError("Grading band not found")

  const data: Prisma.GradingBandUncheckedUpdateInput = {}
  if (input.minPercent !== undefined) data.minPercent = input.minPercent
  if (input.maxPercent !== undefined) data.maxPercent = input.maxPercent
  if (input.grade !== undefined) data.grade = input.grade.toUpperCase()
  if (input.description !== undefined) data.description = input.description ?? null
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  if (input.isActive !== undefined) data.isActive = input.isActive

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Validate the MERGED range against the row as it exists inside this
      // transaction. A partial update supplies only one bound; the schema refine
      // cannot see the persisted counterpart, and reading it before the
      // transaction would leave a stale-check window. Re-read under the tx.
      // The overlap check below additionally takes a school-scoped advisory
      // lock, so the read-then-write sequence is serialized against concurrent
      // creates, updates and reactivations.
      const current = await tx.gradingBand.findFirst({
        where: { id, schoolId },
        select: { minPercent: true, maxPercent: true, isActive: true },
      })
      if (!current) throw notFoundError("Grading band not found")
      const mergedMin = input.minPercent ?? current.minPercent
      const mergedMax = input.maxPercent ?? current.maxPercent
      assertBandRange(mergedMin, mergedMax)

      // Overlap is only enforced among ACTIVE bands. Reactivating a band or
      // making one active must be checked against every other active band in
      // the school (including the merged range). Gaps and adjacency remain
      // allowed.
      const becomesActive = input.isActive === undefined ? current.isActive : input.isActive
      if (becomesActive) {
        // Same school-scoped lock as the create path: the check and the write
        // run as one serialized step, so a concurrent create/reactivation can
        // never commit an overlapping ACTIVE band.
        await lockActiveGradingBands(tx, schoolId)
        await assertNoActiveOverlap(tx, schoolId, mergedMin, mergedMax, id)
      }

      const row = await tx.gradingBand.update({ where: { id }, data })

      const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
      if (input.minPercent !== undefined && existing.minPercent !== input.minPercent) {
        diffFields.push({ field: "minPercent", before: existing.minPercent, after: input.minPercent })
      }
      if (input.maxPercent !== undefined && existing.maxPercent !== input.maxPercent) {
        diffFields.push({ field: "maxPercent", before: existing.maxPercent, after: input.maxPercent })
      }
      if (input.grade !== undefined && existing.grade !== input.grade.toUpperCase()) {
        diffFields.push({ field: "grade", before: existing.grade, after: input.grade.toUpperCase() })
      }
      if (input.description !== undefined && existing.description !== (input.description ?? null)) {
        diffFields.push({
          field: "description",
          before: existing.description,
          after: input.description ?? null,
        })
      }
      if (input.sortOrder !== undefined && existing.sortOrder !== input.sortOrder) {
        diffFields.push({ field: "sortOrder", before: existing.sortOrder, after: input.sortOrder })
      }
      if (input.isActive !== undefined && existing.isActive !== input.isActive) {
        diffFields.push({ field: "isActive", before: existing.isActive, after: input.isActive })
      }

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "GRADING_BAND",
        entityId: id,
        summary: `Updated grading band ${existing.grade}`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
        metadata: { isActive: row.isActive },
      })

      return row
    })
    return toGradingBandDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A grading band already exists for this minimum percentage")
    }
    throw error
  }
}

/**
 * Overlap check against ACTIVE bands only. Two ranges [a1,a2] and [b1,b2]
 * (inclusive) overlap when a1 <= b2 and b1 <= a2. This catches "80–89 and
 * 88–95" but deliberately does not forbid gaps (e.g. 50–59, 70–79) or
 * touching-adjacent bands (60–69, 70–79) — the math allows the boundary
 * between them to sit between integers, and the school may want gaps for F.
 */
async function assertNoActiveOverlap(
  tx: Prisma.TransactionClient,
  schoolId: string,
  minPercent: number,
  maxPercent: number,
  excludeId?: string,
): Promise<void> {
  const where: Prisma.GradingBandWhereInput = {
    schoolId,
    isActive: true,
  }
  if (excludeId) where.id = { not: excludeId }

  const active = await tx.gradingBand.findMany({
    where,
    select: { id: true, grade: true, minPercent: true, maxPercent: true },
  })

  for (const band of active) {
    if (minPercent <= band.maxPercent && band.minPercent <= maxPercent) {
      throw badRequestError(
        `Grading bands cannot overlap with the active band ${band.grade} (${band.minPercent}–${band.maxPercent})`,
      )
    }
  }
}
