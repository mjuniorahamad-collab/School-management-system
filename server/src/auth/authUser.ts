import type { UserStatus } from "@prisma/client"
import type { AuthUser } from "../types/auth.js"

/** Minimal shape of a user row as loaded for auth. */
export interface AuthUserSource {
  id: string
  name: string
  email: string
  status: UserStatus
}

/** The resolved tenant context for an authenticated request (server-derived). */
export interface ResolvedTenant {
  id: string
  name: string
  status: string
}

export function buildAuthUser(
  user: AuthUserSource,
  school: ResolvedTenant,
  roles: string[],
  permissions: ReadonlySet<string>,
): AuthUser {
  return {
    id: user.id,
    school: { id: school.id, name: school.name },
    name: user.name,
    email: user.email,
    status: user.status,
    roles,
    permissions: [...permissions],
  }
}
