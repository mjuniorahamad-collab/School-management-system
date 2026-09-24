import type { UserStatus } from "@prisma/client"

/**
 * Authenticated identity attached to requests as `req.auth` by requireAuth.
 * `permissions` is the resolved flat permission set (SUPER_ADMIN is implied by
 * role, not listed exhaustively).
 */
/** A school the user holds an ACTIVE membership in, and the role held there. */
export interface AuthMembership {
  id: string
  name: string
  role: string
}

export interface AuthUser {
  id: string
  school: { id: string; name: string }
  name: string
  email: string
  status: UserStatus
  roles: string[]
  permissions: string[]
  /** Every school this user can access. >1 means the client shows a switcher. */
  memberships: AuthMembership[]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express Request augmentation
  namespace Express {
    interface Request {
      auth?: AuthUser
    }
  }
}