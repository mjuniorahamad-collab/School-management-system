import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockSessionForUpdate } from "../../lib/db-locks.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { AuditActor } from "../audit-logs/audit-log.types.js"
import {
  CLASS_SCOPE_KEY,
  assertRegisterAcceptsRecordMutation,
  assertRegisterTransition,
  deriveScopeKey,
} from "./attendance-register.rules.js"
import type { ListRegistersQuery, OpenRegisterInput } from "./attendance-register.schema.js"
import type {
  AttendanceRegisterDetail,
  AttendanceRegisterListResult,
  AttendanceRegisterStatusValue,
} from "./attendance-register.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

// Definitive attendance statuses that satisfy a register's per-student
// completeness requirement. HOLIDAY is never definitive.
const DEFINITIVE_STATUSES = ["PRESENT", "ABSENT", "LATE"] as const

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function toRegisterDetail(row: {
  id: string
  academicSessionId: string
  classId: string
  sectionId: string | null
  scopeKey: string
  date: Date
  status: AttendanceRegisterStatusValue
  expectedCount: number
  submittedAt: Date | null
  submittedByUserId: string | null
  verifiedAt: Date | null
  verifiedByUserId: string | null
  createdAt: Date
  updatedAt: Date
}): AttendanceRegisterDetail {
  return {
    id: row.id,
    academicSessionId: row.academicSessionId,
    classId: row.classId,
    sectionId: row.sectionId,
    scopeKey: row.scopeKey,
    date: row.date.toISOString().slice(0, 10),
    status: row.status,
    expectedCount: row.expectedCount,
    submittedAt: iso(row.submittedAt),
    submittedByUserId: row.submittedByUserId,
    verifiedAt: iso(row.verifiedAt),
    verifiedByUserId: row.verifiedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * The expected roster for a date: enrollment ids whose placement period covers
 * the date (`effectiveFrom <= d < effectiveTo`, NULL effectiveTo = open) in the
 * register's class/section/session. A class-level register (sectionId NULL)
 * covers every section of the class.
 */
async function expectedRosterEnrollmentIds(
  client: DbClient,
  scope: {
    schoolId: string
    academicSessionId: string
    classId: string
    sectionId: string | null
    date: Date
  },
): Promise<string[]> {
  const periods = await client.studentEnrollmentPeriod.findMany({
    where: {
      schoolId: scope.schoolId,
      academicSessionId: scope.academicSessionId,
      classId: scope.classId,
      ...(scope.sectionId ? { sectionId: scope.sectionId } : {}),
      effectiveFrom: { lte: scope.date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: scope.date } }],
    },
    select: { enrollmentId: true },
  })
  return periods.map((period) => period.enrollmentId)
}

async function assertScope(
  prisma: PrismaClient,
  schoolId: string,
  academicSessionId: string,
  classId: string,
  sectionId: string | null,
): Promise<void> {
  const session = await prisma.academicSession.findFirst({
    where: { id: academicSessionId, schoolId },
    select: { id: true },
  })
  if (!session) throw badRequestError("Academic session is not valid for this school")

  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } })
  if (!cls) throw badRequestError("Class is not valid for this school")

  if (sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId, classId },
      select: { id: true },
    })
    if (!section) throw badRequestError("Section is not valid for the selected class")
  }
}

async function findRegisterRow(
  prisma: PrismaClient,
  id: string,
  schoolId: string,
) {
  const row = await prisma.attendanceRegister.findFirst({ where: { id, schoolId } })
  if (!row) throw notFoundError("Attendance register not found")
  return row
}

export async function listRegisters(
  query: ListRegistersQuery,
  schoolId: string,
): Promise<AttendanceRegisterListResult> {
  const prisma = await requirePrisma()
  const where: Prisma.AttendanceRegisterWhereInput = { schoolId }
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.classId) where.classId = query.classId
  if (query.sectionId) where.sectionId = query.sectionId
  if (query.status) where.status = query.status
  if (query.dateFrom || query.dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {}
    if (query.dateFrom) dateFilter.gte = toDateOnly(query.dateFrom)
    if (query.dateTo) dateFilter.lte = toDateOnly(query.dateTo)
    where.date = dateFilter
  }

  const [total, rows] = await prisma.$transaction([
    prisma.attendanceRegister.count({ where }),
    prisma.attendanceRegister.findMany({ where, orderBy: [{ date: "desc" }, { scopeKey: "asc" }] }),
  ])
  return { items: rows.map(toRegisterDetail), total }
}

export async function getRegisterById(
  id: string,
  schoolId: string,
): Promise<AttendanceRegisterDetail> {
  const prisma = await requirePrisma()
  return toRegisterDetail(await findRegisterRow(prisma, id, schoolId))
}

/**
 * Get-or-create the register for a (session, class, scope, date). The scopeKey is
 * always server-derived; while the register is not VERIFIED its expectedCount is
 * refreshed from the current placement roster. A VERIFIED register is returned
 * untouched — changing its roster is only ever an explicit reopen.
 */
export async function openRegister(
  input: OpenRegisterInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AttendanceRegisterDetail> {
  const prisma = await requirePrisma()
  const date = toDateOnly(input.date)
  const sectionId = input.sectionId ?? null
  const scopeKey = deriveScopeKey(sectionId)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  await assertScope(prisma, schoolId, input.academicSessionId, input.classId, sectionId)

  const row = await prisma.$transaction(async (tx) => {
    await lockSessionForUpdate(tx, { schoolId, academicSessionId: input.academicSessionId })
    const expectedCount = (
      await expectedRosterEnrollmentIds(tx, {
        schoolId,
        academicSessionId: input.academicSessionId,
        classId: input.classId,
        sectionId,
        date,
      })
    ).length

    const existing = await tx.attendanceRegister.findUnique({
      where: {
        schoolId_academicSessionId_classId_scopeKey_date: {
          schoolId,
          academicSessionId: input.academicSessionId,
          classId: input.classId,
          scopeKey,
          date,
        },
      },
    })
    if (existing) {
      if (existing.status === "VERIFIED") return existing
      return tx.attendanceRegister.update({ where: { id: existing.id }, data: { expectedCount } })
    }

    const created = await tx.attendanceRegister.create({
      data: {
        schoolId,
        academicSessionId: input.academicSessionId,
        classId: input.classId,
        sectionId,
        scopeKey,
        date,
        status: "OPEN",
        expectedCount,
      },
    })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "CREATE",
      entityType: "ATTENDANCE_REGISTER",
      entityId: created.id,
      summary: `Opened attendance register for ${input.date}`,
      metadata: { sectionId, scopeKey, expectedCount },
    })
    return created
  })

  return toRegisterDetail(row)
}

export async function submitRegister(
  id: string,
  schoolId: string,
  actor: AuthUser,
): Promise<AttendanceRegisterDetail> {
  const prisma = await requirePrisma()
  const existing = await findRegisterRow(prisma, id, schoolId)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const row = await prisma.$transaction(async (tx) => {
    await lockSessionForUpdate(tx, { schoolId, academicSessionId: existing.academicSessionId })
    const locked = await tx.attendanceRegister.findFirst({ where: { id, schoolId } })
    if (!locked) throw notFoundError("Attendance register not found")
    assertRegisterTransition(locked.status, "SUBMITTED")
    const updated = await tx.attendanceRegister.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date(), submittedByUserId: actor.id },
    })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "ATTENDANCE_REGISTER",
      entityId: id,
      summary: `Submitted attendance register for ${locked.date.toISOString().slice(0, 10)}`,
    })
    return updated
  })
  return toRegisterDetail(row)
}

/**
 * VERIFIED requires every expected student to have exactly one definitive
 * (PRESENT/ABSENT/LATE) record for the date. A missing or duplicated record is a
 * hard 400 — the register is never silently verified over a gap.
 */
export async function verifyRegister(
  id: string,
  schoolId: string,
  actor: AuthUser,
): Promise<AttendanceRegisterDetail> {
  const prisma = await requirePrisma()
  const existing = await findRegisterRow(prisma, id, schoolId)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const row = await prisma.$transaction(async (tx) => {
    // Serialize with every roster/record writer for this session, then read the
    // roster, the records and the register status from the locked tx so the
    // completeness decision is made against a consistent snapshot (no TOCTOU).
    await lockSessionForUpdate(tx, { schoolId, academicSessionId: existing.academicSessionId })
    const locked = await tx.attendanceRegister.findFirst({ where: { id, schoolId } })
    if (!locked) throw notFoundError("Attendance register not found")
    assertRegisterTransition(locked.status, "VERIFIED")

    const enrollmentIds = await expectedRosterEnrollmentIds(tx, {
      schoolId,
      academicSessionId: locked.academicSessionId,
      classId: locked.classId,
      sectionId: locked.sectionId,
      date: locked.date,
    })

    const records = await tx.attendanceRecord.findMany({
      where: {
        schoolId,
        date: locked.date,
        enrollmentId: { in: enrollmentIds },
        status: { in: [...DEFINITIVE_STATUSES] },
      },
      select: { enrollmentId: true },
    })
    const counts = new Map<string, number>()
    for (const record of records) {
      counts.set(record.enrollmentId, (counts.get(record.enrollmentId) ?? 0) + 1)
    }
    const missing = enrollmentIds.filter((enrollmentId) => (counts.get(enrollmentId) ?? 0) === 0)
    const duplicated = enrollmentIds.filter((enrollmentId) => (counts.get(enrollmentId) ?? 0) > 1)
    if (missing.length > 0 || duplicated.length > 0) {
      throw badRequestError(
        "Attendance register cannot be verified while expected records are missing or duplicated",
        { missing: missing.length, duplicated: duplicated.length, expected: enrollmentIds.length },
      )
    }

    const updated = await tx.attendanceRegister.update({
      where: { id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verifiedByUserId: actor.id,
        expectedCount: enrollmentIds.length,
      },
    })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "ATTENDANCE_REGISTER",
      entityId: id,
      summary: `Verified attendance register for ${locked.date.toISOString().slice(0, 10)}`,
      metadata: { expectedCount: enrollmentIds.length },
    })
    return updated
  })
  return toRegisterDetail(row)
}

async function reopenRegisters(
  tx: DbClient,
  rows: { id: string; schoolId: string; date: Date }[],
  auditActor: AuditActor,
  reason: string,
): Promise<number> {
  for (const row of rows) {
    await tx.attendanceRegister.update({
      where: { id: row.id },
      data: {
        status: "OPEN",
        submittedAt: null,
        submittedByUserId: null,
        verifiedAt: null,
        verifiedByUserId: null,
      },
    })
    await recordAudit(tx, {
      schoolId: row.schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "ATTENDANCE_REGISTER",
      entityId: row.id,
      summary: `Reopened verified attendance register for ${row.date.toISOString().slice(0, 10)}`,
      diff: { fields: [{ field: "status", before: "VERIFIED", after: "OPEN" }] },
      metadata: { reason },
    })
  }
  return rows.length
}

/**
 * Reopens every VERIFIED register for a session on a single date. Used when a
 * CalendarDay change alters the instructional truth of that date (docs §7/§10a).
 * Runs inside the caller's transaction so the data change and the reopen are
 * atomic; each reopen is audited.
 */
export async function reopenVerifiedRegistersForSessionDate(
  tx: DbClient,
  params: { schoolId: string; academicSessionId: string; date: string; auditActor: AuditActor; reason: string },
): Promise<number> {
  const rows = await tx.attendanceRegister.findMany({
    where: {
      schoolId: params.schoolId,
      academicSessionId: params.academicSessionId,
      date: toDateOnly(params.date),
      status: "VERIFIED",
    },
    select: { id: true, schoolId: true, date: true },
  })
  return reopenRegisters(tx, rows, params.auditActor, params.reason)
}

/**
 * Reopens every VERIFIED register for the given class/section scopes across an
 * inclusive date range. Used when a placement-period edit changes the expected
 * roster of a register (docs §7: a correction touching a VERIFIED register
 * reopens it for re-verification).
 */
export async function reopenVerifiedRegistersForScopes(
  tx: DbClient,
  params: {
    schoolId: string
    academicSessionId: string
    dateFrom: string
    dateTo: string
    scopes: { classId: string; sectionId: string | null }[]
    auditActor: AuditActor
    reason: string
  },
): Promise<number> {
  if (params.scopes.length === 0) return 0
  const rows = await tx.attendanceRegister.findMany({
    where: {
      schoolId: params.schoolId,
      academicSessionId: params.academicSessionId,
      date: { gte: toDateOnly(params.dateFrom), lte: toDateOnly(params.dateTo) },
      status: "VERIFIED",
      OR: params.scopes.map((scope) => ({
        classId: scope.classId,
        scopeKey: deriveScopeKey(scope.sectionId),
      })),
    },
    select: { id: true, schoolId: true, date: true },
  })
  return reopenRegisters(tx, rows, params.auditActor, params.reason)
}

/**
 * How many VERIFIED registers a roster change would invalidate, without
 * changing them. Used to fail safely on paths that have no authenticated actor
 * to attribute an automatic reopen to (the seed backfill).
 */
export async function countVerifiedRegistersForScopes(
  client: DbClient,
  params: {
    schoolId: string
    academicSessionId: string
    dateFrom: string
    dateTo: string
    scopes: { classId: string; sectionId: string | null }[]
  },
): Promise<number> {
  if (params.scopes.length === 0) return 0
  return client.attendanceRegister.count({
    where: {
      schoolId: params.schoolId,
      academicSessionId: params.academicSessionId,
      date: { gte: toDateOnly(params.dateFrom), lte: toDateOnly(params.dateTo) },
      status: "VERIFIED",
      OR: params.scopes.map((scope) => ({
        classId: scope.classId,
        scopeKey: deriveScopeKey(scope.sectionId),
      })),
    },
  })
}

/**
 * Reopens every VERIFIED register on any of the given dates in a session. Used
 * by the calendar upsert workflow, where a set of weekday rules can flip the
 * instructional truth of several dates at once (docs §10a). Runs in the
 * caller's transaction; each reopen is audited individually.
 */
export async function reopenVerifiedRegistersForSessionDates(
  tx: DbClient,
  params: {
    schoolId: string
    academicSessionId: string
    dates: string[]
    auditActor: AuditActor
    reason: string
  },
): Promise<number> {
  if (params.dates.length === 0) return 0
  const rows = await tx.attendanceRegister.findMany({
    where: {
      schoolId: params.schoolId,
      academicSessionId: params.academicSessionId,
      date: { in: params.dates.map(toDateOnly) },
      status: "VERIFIED",
    },
    select: { id: true, schoolId: true, date: true },
  })
  return reopenRegisters(tx, rows, params.auditActor, params.reason)
}

/**
 * Guard for attendance-record mutations: the record's class falls under both its
 * own section scope and the class-wide scope, so a record may only be written
 * when NEITHER register is SUBMITTED/VERIFIED. Must be called after the session
 * lock is held.
 */
export async function assertRegistersMutableForRecordScope(
  client: DbClient,
  scope: {
    schoolId: string
    academicSessionId: string
    classId: string
    sectionId: string | null
    date: Date
  },
): Promise<void> {
  const registers = await client.attendanceRegister.findMany({
    where: {
      schoolId: scope.schoolId,
      academicSessionId: scope.academicSessionId,
      classId: scope.classId,
      date: scope.date,
      scopeKey: { in: [deriveScopeKey(scope.sectionId), CLASS_SCOPE_KEY] },
    },
    select: { status: true },
  })
  for (const register of registers) assertRegisterAcceptsRecordMutation(register.status)
}
