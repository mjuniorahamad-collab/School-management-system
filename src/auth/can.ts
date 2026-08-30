import type { AuthUser } from "@/auth/types"
import { SUPER_ADMIN_ROLE } from "@/auth/types"

/**
 * UI-hint only — the backend is authoritative via requirePermission. The
 * SUPER_ADMIN role bypasses checks (mirrors the server rule, never email).
 */
export function canUser(user: AuthUser | null | undefined, permission: string): boolean {
  if (!user) return false
  if (user.roles.includes(SUPER_ADMIN_ROLE)) return true
  return user.permissions.includes(permission)
}