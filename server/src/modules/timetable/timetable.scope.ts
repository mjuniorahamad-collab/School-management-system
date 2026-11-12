import type { RequestHandler } from "express"
import { forbiddenError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { getTeacherForUser, isPlatformSuperAdmin } from "../../lib/teacher-scope.js"

function requireAuthScope(req: any) {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

export const requireTimetableManage: RequestHandler = async (req, _res, next) => {
  try {
    const auth = requireAuthScope(req)
    if (isPlatformSuperAdmin(auth)) return next()
    if (auth.roles.includes("TEACHER")) {
      throw forbiddenError("Teachers cannot modify timetables")
    }
    return next()
  } catch (err) {
    next(err)
  }
}

export const requireTimetableViewScope: RequestHandler = async (req, _res, next) => {
  try {
    const auth = requireAuthScope(req)
    if (isPlatformSuperAdmin(auth)) return next()
    if (auth.roles.includes("TEACHER")) {
      const prisma = await getPrisma()
      if (!prisma) return next()
      const teacher = await getTeacherForUser(prisma, auth.id, auth.school.id)
      if (!teacher) throw forbiddenError("Teacher profile not linked")
      ;(req as any).teacherTimetableScope = {
        teacherId: teacher.id,
        classIds: [...new Set(((teacher as any).teacherClasses || []).map((c: any) => c.classId))],
        sectionPairs: new Set(((teacher as any).teacherClasses || []).map((c: any) => `${c.classId}:${c.sectionId ?? ""}`)),
      }
      return next()
    }
    return next()
  } catch (err) {
    next(err)
  }
}
