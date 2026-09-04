import type { Prisma, PrismaClient } from "@prisma/client"
import { badRequestError } from "../../lib/ApiError.js"
import type { GuardianInput } from "./student.schema.js"

type Db = Prisma.TransactionClient | PrismaClient

/**
 * Resolves the academic session a placement targets. Falls back to the school's
 * ACTIVE session; an explicit session must belong to the school and be ACTIVE
 * (students cannot be placed into closed or upcoming sessions).
 */
export async function resolveActiveSession(
  prisma: Db,
  schoolId: string,
  explicitSessionId?: string,
): Promise<{ id: string }> {
  if (explicitSessionId) {
    const session = await prisma.academicSession.findFirst({
      where: { id: explicitSessionId, schoolId },
    })
    if (!session) throw badRequestError("Academic session is not valid for this school")
    if (session.status !== "ACTIVE") {
      throw badRequestError("Students can only be placed in the active academic session")
    }
    return session
  }
  const session = await prisma.academicSession.findFirst({
    where: { schoolId, status: "ACTIVE" },
    orderBy: { startDate: "asc" },
  })
  if (!session) throw badRequestError("No active academic session is configured for this school")
  return session
}

/**
 * Resolves a class + optional section for a placement, enforcing that the class
 * belongs to the school and that a section is supplied when (and only when) the
 * class has sections configured.
 */
export async function resolveClassAndSection(
  prisma: Db,
  schoolId: string,
  classId: string,
  sectionId?: string | null,
): Promise<{ classId: string; sectionId: string | null }> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    include: { sections: { select: { id: true } } },
  })
  if (!cls) throw badRequestError("Class is not valid for this school")

  if (cls.sections.length === 0) {
    if (sectionId) throw badRequestError("This class has no sections to select")
    return { classId: cls.id, sectionId: null }
  }

  if (!sectionId) throw badRequestError("Section is required for this class")
  const section = await prisma.section.findFirst({ where: { id: sectionId, classId } })
  if (!section) throw badRequestError("Section is not valid for the selected class")
  return { classId: cls.id, sectionId: section.id }
}

/**
 * Normalizes the primary-guardian flag on an incoming guardian list:
 * - more than one primary is a hard error,
 * - when none is marked, the first guardian becomes primary,
 * - every non-primary guardian is explicitly flagged false.
 */
export function normalizeGuardianPrimaries(guardians: GuardianInput[]): GuardianInput[] {
  if (guardians.length === 0) return guardians
  const primaries = guardians.filter((guardian) => guardian.isPrimary)
  if (primaries.length > 1) {
    throw badRequestError("Only one guardian can be marked as primary")
  }
  if (primaries.length === 1) {
    return guardians.map((guardian) =>
      guardian.isPrimary ? guardian : { ...guardian, isPrimary: false },
    )
  }
  return guardians.map((guardian, index) => ({
    ...guardian,
    isPrimary: index === 0,
  }))
}