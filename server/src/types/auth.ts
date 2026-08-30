import type { UserStatus } from "@prisma/client"

/**
 * Authenticated identity attached to requests as `req.auth` by requireAuth.
 * `permissions` is the resolved flat permission set (SUPER_ADMIN is implied by
 * role, not listed exhaustively).
 */
export interface AuthUser {
  id: string
  school: { id: string; name: string }
  name: string
  email: string
  status: UserStatus
  roles: string[]
  permissions: string[]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express Request augmentation
  namespace Express {
    interface Request {
      auth?: AuthUser
    }
  }
}