import type { UserStatus } from "@prisma/client"
import type { AuthUser } from "../types/auth.js"

/** Minimal shape of a user row as loaded together with its school. */
export interface AuthUserSource {
  id: string
  name: string
  email: string
  status: UserStatus
  school: { id: string; name: string }
}

export function buildAuthUser(
  user: AuthUserSource,
  roles: string[],
  permissions: ReadonlySet<string>,
): AuthUser {
  return {
    id: user.id,
    school: user.school,
    name: user.name,
    email: user.email,
    status: user.status,
    roles,
    permissions: [...permissions],
  }
}