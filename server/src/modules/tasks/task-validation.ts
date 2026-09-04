import { ROLE_NAMES, SUPER_ADMIN_ROLE } from "../../permissions/permissions.js"
import { badRequestError, forbiddenError } from "../../lib/ApiError.js"

export type TaskValidationPrisma = import("@prisma/client").PrismaClient

interface TaskTargetingInput {
  academicSessionId: string
  classId: string
  sectionId: string | null | undefined
  subjectId: string
  teacherId: string
}

/**
 * Validates every targeting reference of a Homework/Assignment against the
 * caller's school. All writes pass through this helper so a caller can never
 * smuggle another tenant's academic session/class/section/subject/teacher into
 * a task by crafting IDs in the body. Returns the section (null when a
 * sectionless whole-class target was given — a class with sections is never
 * forced to target one).
 */
export async function validateTaskTargeting(
  prisma: TaskValidationPrisma,
  opts: { schoolId: string; input: TaskTargetingInput },
): Promise<{ sectionId: string | null }> {
  const { schoolId, input } = opts

  const academicSession = await prisma.academicSession.findFirst({
    where: { id: input.academicSessionId, schoolId },
    select: { id: true },
  })
  if (!academicSession) throw badRequestError("Academic session not found in this school")

  const cls = await prisma.class.findFirst({
    where: { id: input.classId, schoolId },
    select: { id: true },
  })
  if (!cls) throw badRequestError("Class not found in this school")

  const sectionId = input.sectionId ?? null
  if (sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId },
      select: { classId: true },
    })
    if (!section || section.classId !== cls.id) {
      throw badRequestError("Section does not belong to the specified class")
    }
  }

  const subject = await prisma.subject.findFirst({
    where: { id: input.subjectId, schoolId },
    select: { id: true },
  })
  if (!subject) throw badRequestError("Subject not found in this school")

  const teacher = await prisma.teacher.findFirst({
    where: { id: input.teacherId, schoolId, status: "ACTIVE" },
    select: { id: true },
  })
  if (!teacher) throw badRequestError("Teacher not found in this school")

  return { sectionId }
}

/** Admins (SCHOOL_ADMIN/SUPER_ADMIN) may manage tasks for any in-school teacher. */
export function isTaskAdminActor(roles: readonly string[]): boolean {
  return roles.includes(ROLE_NAMES.SCHOOL_ADMIN) || roles.includes(SUPER_ADMIN_ROLE)
}

/**
 * Resolves the acting teacher for a non-admin user: the Teacher row linked to
 * their global User account in this school. Returns null for admins (no
 * per-teacher restriction) and for users without a linked Teacher profile.
 */
export async function resolveActingTeacher(
  prisma: TaskValidationPrisma,
  opts: { schoolId: string; userId: string; roles: readonly string[] },
): Promise<string | null> {
  if (isTaskAdminActor(opts.roles)) return null

  const teacher = await prisma.teacher.findFirst({
    where: { schoolId: opts.schoolId, userId: opts.userId },
    select: { id: true },
  })
  return teacher?.id ?? null
}

/**
 * TEACHER-role write enforcement: the actor must have a Teacher profile linked
 * to their account in this school. Returns that teacher id. Callers enforce the
 * "own profile only" rule against it.
 */
export async function requireActingTeacher(
  prisma: TaskValidationPrisma,
  opts: { schoolId: string; userId: string; roles: readonly string[] },
): Promise<string> {
  const actingTeacherId = await resolveActingTeacher(prisma, opts)
  if (!actingTeacherId) {
    throw forbiddenError("Your account is not linked to a teacher profile in this school")
  }
  return actingTeacherId
}

/**
 * Verifies a teacher covers the target class/section and subject. Administrators
 * bypass this check (school-scope only, enforced by validateTaskTargeting);
 * teachers adhere to their TeacherClass/TeacherSubject assignments.
 */
export async function assertTeacherAssignmentFit(
  prisma: TaskValidationPrisma,
  opts: { teacherId: string; classId: string; sectionId: string | null; subjectId: string },
): Promise<void> {
  const subjectCount = await prisma.teacherSubject.count({
    where: { teacherId: opts.teacherId, subjectId: opts.subjectId },
  })
  if (subjectCount === 0) {
    throw forbiddenError("This teacher does not teach the selected subject")
  }

  const classCoverage = await prisma.teacherClass.count({
    where: {
      teacherId: opts.teacherId,
      classId: opts.classId,
      sectionId: opts.sectionId,
    },
  })
  if (classCoverage === 0) {
    throw forbiddenError("This teacher does not teach the selected class/section")
  }
}
