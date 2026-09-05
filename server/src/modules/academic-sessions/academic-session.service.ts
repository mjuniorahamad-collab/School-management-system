import { Prisma } from "@prisma/client"
import type { AcademicSessionStatus } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { validateDateRange } from "./academic-session.rules.js"
import type {
  CreateSessionInput,
  ListSessionsQuery,
  UpdateSessionInput,
} from "./academic-session.schema.js"
import { toAcademicSessionDetail } from "./academic-session.mapper.js"
import type { AcademicSessionDetail, AcademicSessionListResult } from "./academic-session.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

async function countActiveSessions(prisma: PrismaClient, schoolId: string, excludeId?: string): Promise<number> {
  return prisma.academicSession.count({
    where: { schoolId, status: "ACTIVE", ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  })
}

async function assertSessionExists(
  prisma: PrismaClient,
  id: string,
  schoolId: string,
): Promise<{ id: string; name: string; code: string; status: AcademicSessionStatus }> {
  const session = await prisma.academicSession.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, code: true, status: true },
  })
  if (!session) throw notFoundError("Academic session not found")
  return session
}

export async function listSessions(
  query: ListSessionsQuery,
  schoolId: string,
): Promise<AcademicSessionListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.AcademicSessionWhereInput = { schoolId }
  if (query.status) where.status = query.status
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.academicSession.count({ where }),
    prisma.academicSession.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { name: "asc" }],
    }),
  ])

  return {
    items: rows.map(toAcademicSessionDetail),
    total,
  }
}

export async function getSessionById(id: string, schoolId: string): Promise<AcademicSessionDetail> {
  const prisma = await requirePrisma()
  const session = await prisma.academicSession.findFirst({ where: { id, schoolId } })
  if (!session) throw notFoundError("Academic session not found")
  return toAcademicSessionDetail(session)
}

/**
 * Creates an academic session. The existing Students path requires at least one
 * ACTIVE session to place students, so a session that was created ACTIVE must
 * not collide with another ACTIVE session.
 */
export async function createSession(
  input: CreateSessionInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AcademicSessionDetail> {
  const prisma = await requirePrisma()
  validateDateRange(input.startDate, input.endDate)

  const status: AcademicSessionStatus = input.status ?? "UPCOMING"
  if (status === "ACTIVE") {
    const activeCount = await countActiveSessions(prisma, schoolId)
    if (activeCount >= 1) {
      throw badRequestError("An active academic session already exists. Close it first.")
    }
  }

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const session = await prisma.$transaction(async (tx) => {
      const row = await tx.academicSession.create({
        data: {
          schoolId,
          name: input.name,
          code: input.code,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          endDate: new Date(`${input.endDate}T00:00:00.000Z`),
          status,
        },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "ACADEMIC_SESSION",
        entityId: row.id,
        summary: `Created academic session ${row.name} (${row.code})`,
        metadata: { code: row.code, status: row.status },
      })

      return row
    })
    return toAcademicSessionDetail(session)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("An academic session with this code already exists")
    }
    throw error
  }
}

export async function updateSession(
  id: string,
  input: UpdateSessionInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AcademicSessionDetail> {
  const prisma = await requirePrisma()
  const current = await assertSessionExists(prisma, id, schoolId)

  const data: Prisma.AcademicSessionUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.code !== undefined) data.code = input.code
  if (input.startDate !== undefined) data.startDate = new Date(`${input.startDate}T00:00:00.000Z`)
  if (input.endDate !== undefined) data.endDate = new Date(`${input.endDate}T00:00:00.000Z`)

  const nextActive = input.status
  if (nextActive !== undefined) {
    if (nextActive === "ACTIVE") {
      const activeCount = await countActiveSessions(prisma, schoolId, id)
      if (activeCount >= 1) {
        throw badRequestError("An active academic session already exists. Close it first.")
      }
    }
    data.status = nextActive
  }

  // Validate the resolved date range once all provided fields are known.
  if (data.startDate || data.endDate) {
    const session = await prisma.academicSession.findFirst({
      where: { id, schoolId },
      select: { startDate: true, endDate: true },
    })
    const startDate = (data.startDate ?? session?.startDate) as Date | undefined
    const endDate = (data.endDate ?? session?.endDate) as Date | undefined
    if (startDate && endDate) validateDateRange(startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10))
  }

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.academicSession.update({ where: { id }, data })

      const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
      if (nextActive !== undefined && current.status !== nextActive) {
        diffFields.push({ field: "status", before: current.status, after: nextActive })
      }
      if (input.name !== undefined && current.name !== input.name) {
        diffFields.push({ field: "name", before: current.name, after: input.name })
      }
      if (input.code !== undefined && current.code !== input.code) {
        diffFields.push({ field: "code", before: current.code, after: input.code })
      }

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: nextActive !== undefined && current.status !== nextActive ? "STATUS_CHANGE" : "UPDATE",
        entityType: "ACADEMIC_SESSION",
        entityId: id,
        summary:
          nextActive !== undefined && current.status !== nextActive
            ? `Changed academic session status to ${nextActive}`
            : `Updated academic session ${current.name}`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })

      return row
    })
    return toAcademicSessionDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("An academic session with this code already exists")
    }
    throw error
  }
}
