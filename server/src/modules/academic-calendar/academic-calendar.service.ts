import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockSessionForUpdate } from "../../lib/db-locks.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import {
  reopenVerifiedRegistersForSessionDate,
  reopenVerifiedRegistersForSessionDates,
} from "../attendance/attendance-register.service.js"
import { toAcademicCalendarDetail, toCalendarDayDetail } from "./academic-calendar.mapper.js"
import {
  assertInstructionalValue,
  deriveWeeklyAffectedDates,
  normalizeWorkingWeekdays,
} from "./academic-calendar.rules.js"
import type {
  CreateCalendarDayInput,
  ListCalendarDaysQuery,
  UpdateCalendarDayInput,
  UpsertCalendarInput,
} from "./academic-calendar.schema.js"
import type {
  AcademicCalendarDetail,
  CalendarDayDetail,
  CalendarDayListResult,
} from "./academic-calendar.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

async function assertSession(prisma: PrismaClient, academicSessionId: string, schoolId: string): Promise<void> {
  const session = await prisma.academicSession.findFirst({
    where: { id: academicSessionId, schoolId },
    select: { id: true },
  })
  if (!session) throw badRequestError("Academic session is not valid for this school")
}

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export async function listCalendars(schoolId: string): Promise<AcademicCalendarDetail[]> {
  const prisma = await requirePrisma()
  const rows = await prisma.academicCalendar.findMany({
    where: { schoolId },
    orderBy: { createdAt: "asc" },
  })
  return rows.map(toAcademicCalendarDetail)
}

export async function getCalendarBySession(
  academicSessionId: string,
  schoolId: string,
): Promise<AcademicCalendarDetail | null> {
  const prisma = await requirePrisma()
  const row = await prisma.academicCalendar.findFirst({ where: { academicSessionId, schoolId } })
  return row ? toAcademicCalendarDetail(row) : null
}

/**
 * Authors the working-weekday set for a session. An edit marks the calendar
 * AUTHORED and resets its confirmation — confirmation must be explicit and is
 * never implied by a default or by the act of editing.
 */
export async function upsertCalendar(
  academicSessionId: string,
  input: UpsertCalendarInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AcademicCalendarDetail> {
  const prisma = await requirePrisma()
  await assertSession(prisma, academicSessionId, schoolId)
  const workingWeekdays = normalizeWorkingWeekdays(input.workingWeekdays)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const row = await prisma.$transaction(async (tx) => {
    await lockSessionForUpdate(tx, { schoolId, academicSessionId })
    const existing = await tx.academicCalendar.findFirst({
      where: { academicSessionId, schoolId },
    })
    const session = await tx.academicSession.findFirst({
      where: { id: academicSessionId, schoolId },
      select: { startDate: true, endDate: true },
    })

    const previous = existing ? (existing.workingWeekdays as string[]) : []
    // The weekday set changed if it differs member-for-member from the stored set
    // (both are normalized/canonical, so a direct comparison is exact).
    const changed =
      previous.length !== workingWeekdays.length ||
      workingWeekdays.some((weekday) => !previous.includes(weekday))

    // Only override-free dates whose weekly-derived truth flips need a reopen;
    // an explicit CalendarDay for the date wins over the weekly rule.
    let affectedDates: string[] = []
    if (changed && session) {
      const overrides = await tx.calendarDay.findMany({
        where: {
          schoolId,
          academicSessionId,
          date: { gte: session.startDate, lte: session.endDate },
        },
        select: { date: true },
      })
      affectedDates = deriveWeeklyAffectedDates({
        startDate: session.startDate.toISOString().slice(0, 10),
        endDate: session.endDate.toISOString().slice(0, 10),
        previousWeekdays: previous,
        nextWeekdays: workingWeekdays,
        overriddenDates: overrides.map((row) => row.date.toISOString().slice(0, 10)),
      })
    }

    const saved = await tx.academicCalendar.upsert({
      where: { schoolId_academicSessionId: { schoolId, academicSessionId } },
      update: {
        workingWeekdays,
        provenance: "AUTHORED",
        // An unchanged weekday set is not a new authoring act: keep confirmation.
        ...(changed ? { confirmedAt: null, confirmedByUserId: null } : {}),
      },
      create: {
        schoolId,
        academicSessionId,
        workingWeekdays,
        provenance: "AUTHORED",
      },
    })

    const reopened = await reopenVerifiedRegistersForSessionDates(tx, {
      schoolId,
      academicSessionId,
      dates: affectedDates,
      auditActor,
      reason: "Calendar working weekdays changed",
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: existing ? "UPDATE" : "CREATE",
      entityType: "ACADEMIC_CALENDAR",
      entityId: saved.id,
      summary: `Set working weekdays for academic session`,
      metadata: { reopenedRegisters: reopened },
      diff: {
        fields: [
          {
            field: "workingWeekdays",
            before: existing ? (existing.workingWeekdays as string[]) : null,
            after: workingWeekdays,
          },
        ],
      },
    })
    return saved
  })
  return toAcademicCalendarDetail(row)
}

export async function confirmCalendar(
  academicSessionId: string,
  schoolId: string,
  actor: AuthUser,
): Promise<AcademicCalendarDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.academicCalendar.findFirst({
    where: { academicSessionId, schoolId },
  })
  if (!existing) throw notFoundError("Academic calendar not found for this session")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.academicCalendar.update({
      where: { id: existing.id },
      data: { confirmedAt: new Date(), confirmedByUserId: actor.id },
    })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "ACADEMIC_CALENDAR",
      entityId: existing.id,
      summary: `Confirmed academic calendar`,
      diff: {
        fields: [{ field: "confirmedAt", before: existing.confirmedAt, after: updated.confirmedAt }],
      },
    })
    return updated
  })
  return toAcademicCalendarDetail(row)
}

export async function listCalendarDays(
  query: ListCalendarDaysQuery,
  schoolId: string,
): Promise<CalendarDayListResult> {
  const prisma = await requirePrisma()
  const where: Prisma.CalendarDayWhereInput = {
    schoolId,
    academicSessionId: query.academicSessionId,
  }
  if (query.from || query.to) {
    where.date = {}
    if (query.from) where.date.gte = toDateOnly(query.from)
    if (query.to) where.date.lte = toDateOnly(query.to)
  }
  const [total, rows] = await prisma.$transaction([
    prisma.calendarDay.count({ where }),
    prisma.calendarDay.findMany({ where, orderBy: { date: "asc" } }),
  ])
  return { items: rows.map(toCalendarDayDetail), total }
}

export async function createCalendarDay(
  input: CreateCalendarDayInput,
  schoolId: string,
  actor: AuthUser,
): Promise<CalendarDayDetail> {
  const prisma = await requirePrisma()
  await assertSession(prisma, input.academicSessionId, schoolId)
  assertInstructionalValue(input.kind, input.instructionalValue)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const row = await prisma.$transaction(async (tx) => {
      await lockSessionForUpdate(tx, { schoolId, academicSessionId: input.academicSessionId })
      const created = await tx.calendarDay.create({
        data: {
          schoolId,
          academicSessionId: input.academicSessionId,
          date: toDateOnly(input.date),
          kind: input.kind,
          instructionalValue: input.instructionalValue,
          label: input.label ?? null,
          note: input.note ?? null,
          source: "AUTHORED",
          createdByUserId: actor.id,
        },
      })
      // Adding an override can change the date's instructional truth, so any
      // VERIFIED register on the date is reopened for re-verification.
      const reopened = await reopenVerifiedRegistersForSessionDate(tx, {
        schoolId,
        academicSessionId: input.academicSessionId,
        date: input.date,
        auditActor,
        reason: "Calendar day created",
      })
      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "CALENDAR_DAY",
        entityId: created.id,
        summary: `Added ${input.kind} calendar day ${input.date}`,
        metadata: {
          kind: input.kind,
          instructionalValue: input.instructionalValue,
          label: input.label ?? null,
          reopenedRegisters: reopened,
        },
      })
      return created
    })
    return toCalendarDayDetail(row)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A calendar day already exists for this date")
    }
    throw error
  }
}

/**
 * Updates a day. Any content change resets confirmation and reopens VERIFIED
 * registers on that date (its instructional truth changed), all atomically.
 */
export async function updateCalendarDay(
  id: string,
  input: UpdateCalendarDayInput,
  schoolId: string,
  actor: AuthUser,
): Promise<CalendarDayDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.calendarDay.findFirst({ where: { id, schoolId } })
  if (!existing) throw notFoundError("Calendar day not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const kind = (input.kind ?? existing.kind) as CalendarDayDetail["kind"]
  const instructionalValue = input.instructionalValue ?? Number(existing.instructionalValue)
  assertInstructionalValue(kind, instructionalValue)

  const data: Prisma.CalendarDayUncheckedUpdateInput = {
    kind,
    instructionalValue,
    confirmedAt: null,
    confirmedByUserId: null,
  }
  if (input.label !== undefined) data.label = input.label ?? null
  if (input.note !== undefined) data.note = input.note ?? null

  const row = await prisma.$transaction(async (tx) => {
    await lockSessionForUpdate(tx, { schoolId, academicSessionId: existing.academicSessionId })
    const updated = await tx.calendarDay.update({ where: { id }, data })
    const reopened = await reopenVerifiedRegistersForSessionDate(tx, {
      schoolId,
      academicSessionId: existing.academicSessionId,
      date: existing.date.toISOString().slice(0, 10),
      auditActor,
      reason: "Calendar day changed",
    })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "CALENDAR_DAY",
      entityId: id,
      summary: `Updated calendar day ${existing.date.toISOString().slice(0, 10)}`,
      metadata: { reopenedRegisters: reopened },
      diff: {
        fields: [
          { field: "kind", before: existing.kind, after: kind },
          {
            field: "instructionalValue",
            before: Number(existing.instructionalValue),
            after: instructionalValue,
          },
        ],
      },
    })
    return updated
  })
  return toCalendarDayDetail(row)
}

/**
 * Removes an override day. VERIFIED registers on that date are reopened (the
 * date's instructional truth is removed), atomically with the delete.
 */
export async function deleteCalendarDay(
  id: string,
  schoolId: string,
  actor: AuthUser,
): Promise<void> {
  const prisma = await requirePrisma()
  const existing = await prisma.calendarDay.findFirst({ where: { id, schoolId } })
  if (!existing) throw notFoundError("Calendar day not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  await prisma.$transaction(async (tx) => {
    await lockSessionForUpdate(tx, { schoolId, academicSessionId: existing.academicSessionId })
    const reopened = await reopenVerifiedRegistersForSessionDate(tx, {
      schoolId,
      academicSessionId: existing.academicSessionId,
      date: existing.date.toISOString().slice(0, 10),
      auditActor,
      reason: "Calendar day deleted",
    })
    await tx.calendarDay.delete({ where: { id } })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "DELETE",
      entityType: "CALENDAR_DAY",
      entityId: id,
      summary: `Deleted calendar day ${existing.date.toISOString().slice(0, 10)}`,
      metadata: { reopenedRegisters: reopened },
    })
  })
}

export async function confirmCalendarDay(
  id: string,
  schoolId: string,
  actor: AuthUser,
): Promise<CalendarDayDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.calendarDay.findFirst({ where: { id, schoolId } })
  if (!existing) throw notFoundError("Calendar day not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.calendarDay.update({
      where: { id },
      data: { confirmedAt: new Date(), confirmedByUserId: actor.id },
    })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "CALENDAR_DAY",
      entityId: id,
      summary: `Confirmed calendar day ${existing.date.toISOString().slice(0, 10)}`,
    })
    return updated
  })
  return toCalendarDayDetail(row)
}
