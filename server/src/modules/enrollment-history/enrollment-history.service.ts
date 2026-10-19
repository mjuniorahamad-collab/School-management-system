import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockSessionForUpdate } from "../../lib/db-locks.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { AuditActor } from "../audit-logs/audit-log.types.js"
import type { ProvenanceValue } from "../academic-calendar/academic-calendar.types.js"
import {
  countVerifiedRegistersForScopes,
  reopenVerifiedRegistersForScopes,
} from "../attendance/attendance-register.service.js"
import {
  enrollmentPeriodOverlapError,
  isEnrollmentPeriodOverlapError,
} from "./enrollment-history.errors.js"
import { assertPeriodRange, rangesOverlap } from "./enrollment-history.rules.js"
import type { CorrectPeriodInput, ListPeriodsQuery } from "./enrollment-history.schema.js"
import type { EnrollmentPeriodDetail, EnrollmentPeriodListResult } from "./enrollment-history.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function dateOnlyOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function auditFields(auditActor: AuditActor) {
  return {
    actorId: auditActor.id,
    actorName: auditActor.name,
    actorRole: auditActor.role,
    actorEmail: auditActor.email,
  }
}

function toPeriodDetail(row: {
  id: string
  studentId: string
  academicSessionId: string
  enrollmentId: string
  classId: string
  sectionId: string | null
  effectiveFrom: Date
  effectiveTo: Date | null
  source: string
  confirmedAt: Date | null
  confirmedByUserId: string | null
  createdAt: Date
  updatedAt: Date
}): EnrollmentPeriodDetail {
  return {
    id: row.id,
    studentId: row.studentId,
    academicSessionId: row.academicSessionId,
    enrollmentId: row.enrollmentId,
    classId: row.classId,
    sectionId: row.sectionId,
    effectiveFrom: dateOnlyOf(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? dateOnlyOf(row.effectiveTo) : null,
    source: row.source as ProvenanceValue,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    confirmedByUserId: row.confirmedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Creates the first (open) placement period for a new enrollment, if the student
 * has no period yet for the session. Idempotent: a re-run (e.g. seeding) is a
 * no-op rather than a second overlapping period.
 *
 * This is a structural write that belongs to a larger audited operation (student
 * create / admission convert / seed); it does not write its own audit record.
 *
 * Because a new `effectiveFrom` extends the expected roster of the scope from
 * that date to the end of the session, any VERIFIED register in that window is
 * now stale. When an `auditActor` is supplied (the authenticated student-create
 * and admission-convert paths) those registers are reopened atomically and
 * audited. When it is not (the seed backfill) the call fails safely instead of
 * silently invalidating a verified register.
 */
export async function createInitialPeriod(
  client: DbClient,
  params: {
    schoolId: string
    studentId: string
    academicSessionId: string
    enrollmentId: string
    classId: string
    sectionId: string | null
    effectiveFrom: Date
    source: ProvenanceValue
    actorId?: string | null
    auditActor?: AuditActor
  },
): Promise<void> {
  await lockSessionForUpdate(client, {
    schoolId: params.schoolId,
    academicSessionId: params.academicSessionId,
  })

  const existing = await client.studentEnrollmentPeriod.findFirst({
    where: {
      schoolId: params.schoolId,
      studentId: params.studentId,
      academicSessionId: params.academicSessionId,
    },
    select: { id: true },
  })
  if (existing) return

  const session = await client.academicSession.findFirst({
    where: { id: params.academicSessionId, schoolId: params.schoolId },
    select: { endDate: true },
  })
  const scopes = [{ classId: params.classId, sectionId: params.sectionId }]
  const windowFrom = dateOnlyOf(params.effectiveFrom)
  const windowTo = dateOnlyOf(session?.endDate ?? params.effectiveFrom)

  const affectedVerified = await countVerifiedRegistersForScopes(client, {
    schoolId: params.schoolId,
    academicSessionId: params.academicSessionId,
    dateFrom: windowFrom,
    dateTo: windowTo,
    scopes,
  })

  if (affectedVerified > 0 && !params.auditActor) {
    throw new Error(
      "Cannot backfill an initial placement period: VERIFIED attendance registers already exist for the affected dates",
    )
  }

  try {
    await client.studentEnrollmentPeriod.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        academicSessionId: params.academicSessionId,
        enrollmentId: params.enrollmentId,
        classId: params.classId,
        sectionId: params.sectionId,
        effectiveFrom: params.effectiveFrom,
        effectiveTo: null,
        source: params.source,
        createdByUserId: params.actorId ?? null,
        updatedByUserId: params.actorId ?? null,
      },
    })
  } catch (error) {
    if (isEnrollmentPeriodOverlapError(error)) throw enrollmentPeriodOverlapError()
    throw error
  }

  if (affectedVerified > 0 && params.auditActor) {
    await reopenVerifiedRegistersForScopes(client, {
      schoolId: params.schoolId,
      academicSessionId: params.academicSessionId,
      dateFrom: windowFrom,
      dateTo: windowTo,
      scopes,
      auditActor: params.auditActor,
      reason: "Initial placement created",
    })
  }
}

/**
 * Applies the period mutation for a placement change: an in-place same-day
 * reassignment, or a close-and-open transfer. Kept separate so the caller can
 * translate a database-level overlap violation without indenting the branch
 * logic. Caller holds the session lock and commits in the same transaction.
 */
async function applyPlacementMutation(
  client: DbClient,
  open: { id: string; classId: string; sectionId: string | null; effectiveFrom: Date },
  params: {
    schoolId: string
    studentId: string
    academicSessionId: string
    enrollmentId: string
    classId: string
    sectionId: string | null
    changeDate: Date
    source: ProvenanceValue
  },
  auditActor: AuditActor,
  date: string,
): Promise<void> {
  if (params.changeDate.getTime() <= open.effectiveFrom.getTime()) {
    // Same-day (or retroactive-before-start) reassignment: mutate in place so the
    // half-open interval never becomes empty.
    await client.studentEnrollmentPeriod.update({
      where: { id: open.id },
      data: {
        classId: params.classId,
        sectionId: params.sectionId,
        source: params.source,
        confirmedAt: null,
        confirmedByUserId: null,
        updatedByUserId: auditActor.id,
      },
    })
    await recordAudit(client, {
      schoolId: params.schoolId,
      ...auditFields(auditActor),
      action: "UPDATE",
      entityType: "STUDENT_ENROLLMENT_PERIOD",
      entityId: open.id,
      summary: `Reassigned placement effective ${date}`,
      diff: {
        fields: [
          { field: "classId", before: open.classId, after: params.classId },
          { field: "sectionId", before: open.sectionId, after: params.sectionId },
        ],
      },
    })
    return
  }

  await client.studentEnrollmentPeriod.update({
    where: { id: open.id },
    data: { effectiveTo: params.changeDate, updatedByUserId: auditActor.id },
  })
  const created = await client.studentEnrollmentPeriod.create({
    data: {
      schoolId: params.schoolId,
      studentId: params.studentId,
      academicSessionId: params.academicSessionId,
      enrollmentId: params.enrollmentId,
      classId: params.classId,
      sectionId: params.sectionId,
      effectiveFrom: params.changeDate,
      effectiveTo: null,
      source: params.source,
      createdByUserId: auditActor.id,
      updatedByUserId: auditActor.id,
    },
  })
  await recordAudit(client, {
    schoolId: params.schoolId,
    ...auditFields(auditActor),
    action: "UPDATE",
    entityType: "STUDENT_ENROLLMENT_PERIOD",
    entityId: created.id,
    summary: `Transferred placement effective ${date}`,
    diff: {
      fields: [
        { field: "classId", before: open.classId, after: params.classId },
        { field: "sectionId", before: open.sectionId, after: params.sectionId },
        { field: "effectiveTo", before: null, after: date },
      ],
    },
  })
}

/**
 * Records a placement change for a student's existing enrollment. Closes the
 * open period and opens a new one at `changeDate` (shared boundary belongs to the
 * new period). A same-day reassignment (changeDate <= open period start) updates
 * the open period in place instead of creating an empty interval. Any VERIFIED
 * register for the affected scopes on the change date is reopened (audited).
 *
 * `fallbackEffectiveFrom` is used only when no period exists yet (e.g. a student
 * enrolled before placement history was introduced).
 */
export async function recordPlacementChange(
  client: DbClient,
  params: {
    schoolId: string
    studentId: string
    academicSessionId: string
    enrollmentId: string
    classId: string
    sectionId: string | null
    changeDate: Date
    fallbackEffectiveFrom: Date
    source: ProvenanceValue
  },
  auditActor: AuditActor,
): Promise<void> {
  await lockSessionForUpdate(client, {
    schoolId: params.schoolId,
    academicSessionId: params.academicSessionId,
  })

  const open = await client.studentEnrollmentPeriod.findFirst({
    where: {
      schoolId: params.schoolId,
      studentId: params.studentId,
      academicSessionId: params.academicSessionId,
      effectiveTo: null,
    },
  })

  if (!open) {
    await createInitialPeriod(client, {
      schoolId: params.schoolId,
      studentId: params.studentId,
      academicSessionId: params.academicSessionId,
      enrollmentId: params.enrollmentId,
      classId: params.classId,
      sectionId: params.sectionId,
      effectiveFrom: params.fallbackEffectiveFrom,
      source: params.source,
      actorId: auditActor.id,
      auditActor,
    })
    return
  }

  if (open.classId === params.classId && open.sectionId === params.sectionId) return

  const date = dateOnlyOf(params.changeDate)
  const scopes = [
    { classId: open.classId, sectionId: open.sectionId },
    { classId: params.classId, sectionId: params.sectionId },
  ]

  try {
    await applyPlacementMutation(client, open, params, auditActor, date)
  } catch (error) {
    if (isEnrollmentPeriodOverlapError(error)) throw enrollmentPeriodOverlapError()
    throw error
  }

  await reopenVerifiedRegistersForScopes(client, {
    schoolId: params.schoolId,
    academicSessionId: params.academicSessionId,
    dateFrom: date,
    dateTo: date,
    scopes,
    auditActor,
    reason: "Placement changed",
  })
}

export async function listPeriods(
  query: ListPeriodsQuery,
  schoolId: string,
): Promise<EnrollmentPeriodListResult> {
  const prisma = await requirePrisma()
  const where: Prisma.StudentEnrollmentPeriodWhereInput = { schoolId }
  if (query.studentId) where.studentId = query.studentId
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId

  const [total, rows] = await prisma.$transaction([
    prisma.studentEnrollmentPeriod.count({ where }),
    prisma.studentEnrollmentPeriod.findMany({ where, orderBy: [{ effectiveFrom: "asc" }] }),
  ])
  return { items: rows.map(toPeriodDetail), total }
}

/**
 * Retroactive correction of a placement period under `enrollment:history:manage`.
 * Validates the (merged) range, rejects overlaps, resets confirmation, keeps the
 * OPEN period's StudentEnrollment row in sync, and reopens any VERIFIED register
 * touched by the affected window — all in one transaction.
 */
export async function correctPeriod(
  periodId: string,
  input: CorrectPeriodInput,
  schoolId: string,
  actor: AuthUser,
): Promise<EnrollmentPeriodDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.studentEnrollmentPeriod.findFirst({ where: { id: periodId, schoolId } })
  if (!existing) throw notFoundError("Enrollment period not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const newClassId = input.classId ?? existing.classId
  const newSectionId = input.sectionId !== undefined ? input.sectionId : existing.sectionId
  const newFrom = input.effectiveFrom ? toDateOnly(input.effectiveFrom) : existing.effectiveFrom
  const newTo =
    input.effectiveTo !== undefined
      ? input.effectiveTo
        ? toDateOnly(input.effectiveTo)
        : null
      : existing.effectiveTo
  assertPeriodRange(newFrom, newTo)

  const cls = await prisma.class.findFirst({ where: { id: newClassId, schoolId }, select: { id: true } })
  if (!cls) throw badRequestError("Class is not valid for this school")
  if (newSectionId) {
    const section = await prisma.section.findFirst({
      where: { id: newSectionId, classId: newClassId },
      select: { id: true },
    })
    if (!section) throw badRequestError("Section is not valid for the selected class")
  }

  const others = await prisma.studentEnrollmentPeriod.findMany({
    where: {
      schoolId,
      studentId: existing.studentId,
      academicSessionId: existing.academicSessionId,
      id: { not: periodId },
    },
    select: { effectiveFrom: true, effectiveTo: true },
  })
  for (const other of others) {
    if (rangesOverlap(newFrom, newTo, other.effectiveFrom, other.effectiveTo)) {
      throw badRequestError("The corrected period overlaps an existing placement period")
    }
  }

  const session = await prisma.academicSession.findFirst({
    where: { id: existing.academicSessionId, schoolId },
    select: { endDate: true },
  })
  if (!session) throw badRequestError("Academic session is not valid for this school")

  const scopes = [
    { classId: existing.classId, sectionId: existing.sectionId },
    { classId: newClassId, sectionId: newSectionId },
  ]
  const windowFrom = dateOnlyOf(new Date(Math.min(existing.effectiveFrom.getTime(), newFrom.getTime())))
  const windowTo = dateOnlyOf(
    new Date(
      Math.max(
        (existing.effectiveTo ?? session.endDate).getTime(),
        (newTo ?? session.endDate).getTime(),
      ),
    ),
  )

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await lockSessionForUpdate(tx, {
        schoolId,
        academicSessionId: existing.academicSessionId,
      })
      const row = await tx.studentEnrollmentPeriod.update({
        where: { id: periodId },
        data: {
          classId: newClassId,
          sectionId: newSectionId,
          effectiveFrom: newFrom,
          effectiveTo: newTo,
          source: "AUTHORED",
          confirmedAt: null,
          confirmedByUserId: null,
          updatedByUserId: actor.id,
        },
      })

      if (existing.effectiveTo === null) {
        await tx.studentEnrollment.update({
          where: { id: existing.enrollmentId },
          data: { classId: newClassId, sectionId: newSectionId },
        })
      }

      const reopened = await reopenVerifiedRegistersForScopes(tx, {
        schoolId,
        academicSessionId: existing.academicSessionId,
        dateFrom: windowFrom,
        dateTo: windowTo,
        scopes,
        auditActor,
        reason: "Placement period corrected",
      })

      await recordAudit(tx, {
        schoolId,
        ...auditFields(auditActor),
        action: "UPDATE",
        entityType: "STUDENT_ENROLLMENT_PERIOD",
        entityId: periodId,
        summary: `Corrected placement period (${windowFrom}..${windowTo})`,
        metadata: { reopenedRegisters: reopened },
        diff: {
          fields: [
            { field: "classId", before: existing.classId, after: newClassId },
            { field: "sectionId", before: existing.sectionId, after: newSectionId },
            {
              field: "effectiveFrom",
              before: dateOnlyOf(existing.effectiveFrom),
              after: dateOnlyOf(newFrom),
            },
            {
              field: "effectiveTo",
              before: existing.effectiveTo ? dateOnlyOf(existing.effectiveTo) : null,
              after: newTo ? dateOnlyOf(newTo) : null,
            },
          ],
        },
      })
      return row
    })
    return toPeriodDetail(updated)
  } catch (error) {
    if (isEnrollmentPeriodOverlapError(error)) throw enrollmentPeriodOverlapError()
    throw error
  }
}

export async function confirmPeriod(
  periodId: string,
  schoolId: string,
  actor: AuthUser,
): Promise<EnrollmentPeriodDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.studentEnrollmentPeriod.findFirst({ where: { id: periodId, schoolId } })
  if (!existing) throw notFoundError("Enrollment period not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.studentEnrollmentPeriod.update({
      where: { id: periodId },
      data: { confirmedAt: new Date(), confirmedByUserId: actor.id },
    })
    await recordAudit(tx, {
      schoolId,
      ...auditFields(auditActor),
      action: "UPDATE",
      entityType: "STUDENT_ENROLLMENT_PERIOD",
      entityId: periodId,
      summary: `Confirmed placement period from ${dateOnlyOf(existing.effectiveFrom)}`,
      diff: {
        fields: [{ field: "confirmedAt", before: existing.confirmedAt, after: updated.confirmedAt }],
      },
    })
    return updated
  })
  return toPeriodDetail(row)
}
