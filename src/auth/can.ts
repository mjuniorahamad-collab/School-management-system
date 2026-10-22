import type { AuthUser } from "@/auth/types"
import { SUPER_ADMIN_ROLE } from "@/auth/types"
import type { PermissionCode } from "@/types/permissions"

/**
 * UI-hint only — the backend is authoritative via requirePermission. The
 * SUPER_ADMIN role bypasses checks (mirrors the server rule, never email).
 *
 * The permission argument is typed against the canonical catalogue
 * (`src/types/permissions.ts`), so a code that does not exist on the server
 * fails to compile instead of silently hiding an action.
 */
export function canUser(
  user: AuthUser | null | undefined,
  permission: PermissionCode,
): boolean {
  if (!user) return false
  if (user.roles.includes(SUPER_ADMIN_ROLE)) return true
  return user.permissions.includes(permission)
}
