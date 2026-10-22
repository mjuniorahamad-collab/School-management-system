import { SUPER_ADMIN_ROLE } from "@/auth/types"

/** The tenant administrator role (mirrors the server's `ROLE_NAMES.SCHOOL_ADMIN`). */
export const SCHOOL_ADMIN_ROLE = "SCHOOL_ADMIN"

/**
 * Roles that manage the whole school instead of only their own records.
 * Mirrors the server rule in `server/src/modules/tasks/task-validation.ts`
 * (`isTaskAdminActor`), which grants school-wide timetable management.
 */
export const ADMIN_ROLES = [SUPER_ADMIN_ROLE, SCHOOL_ADMIN_ROLE] as const

export function isAdminRole(roles: readonly string[] | undefined | null): boolean {
  if (!roles) return false
  return roles.some((role) => (ADMIN_ROLES as readonly string[]).includes(role))
}
