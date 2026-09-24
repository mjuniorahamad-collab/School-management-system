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

/**
 * A school the authenticated user holds an ACTIVE membership in, with the role
 * they hold *within that school*. The same user may hold different roles in
 * different schools; the client uses this to render a tenant switcher.
 */
export interface ResolvedMembership {
  id: string
  name: string
  role: string
}

export function buildAuthUser(
  user: AuthUserSource,
  school: ResolvedTenant,
  roles: string[],
  permissions: ReadonlySet<string>,
  memberships: ResolvedMembership[],
): AuthUser {
  return {
    id: user.id,
    school: { id: school.id, name: school.name },
    name: user.name,
    email: user.email,
    status: user.status,
    roles,
    permissions: [...permissions],
    memberships,
  }
}
