import type { PrismaClient } from "@prisma/client"
import { forbiddenError } from "../lib/ApiError.js"
import type { AuthUser } from "../types/auth.js"
import { SUPER_ADMIN_ROLE } from "../permissions/permissions.js"

export async function getTeacherForUser(
  prisma: PrismaClient,
  userId: string,
  schoolId: string,
) {
  const teacher = await prisma.teacher.findFirst({
    where: { userId, schoolId },
    include: {
      teacherSubjects: { select: { subjectId: true } },
      teacherClasses: { select: { classId: true, sectionId: true } },
    },
  })
  return teacher
}

export function isPlatformSuperAdmin(user: AuthUser): boolean {
  return user.roles.includes(SUPER_ADMIN_ROLE)
}

export function isTeacher(user: AuthUser): boolean {
  return user.roles.includes("TEACHER")
}

export async function assertTeacherAssignedToClassSection(
  prisma: PrismaClient,
  userId: string,
  schoolId: string,
  classId: string,
  sectionId: string | null,
) {
  const teacher = await getTeacherForUser(prisma, userId, schoolId)
  if (!teacher) throw forbiddenError("Teacher profile not linked")
  const assigned = (teacher as any).teacherClasses?.some(
    (c: any) => c.classId === classId && (c.sectionId === sectionId || c.sectionId === null),
  )
  if (!assigned) throw forbiddenError("Not assigned to this class/section")
  return teacher
}
