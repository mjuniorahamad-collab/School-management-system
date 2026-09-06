import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"

/**
 * A "portal-only" user can view the Student/Parent Portal (`portal:view`) but
 * has no dashboard/admin scopes. Used to route such users (parents/students)
 * away from the admin dashboard to their portal landing.
 */
export function isPortalOnlyUser(user: AuthUser | null | undefined): boolean {
  return Boolean(user) && canUser(user, "portal:view") && !canUser(user, "dashboard:view")
}

/** Role-aware landing page after sign-in or on visiting the app root. */
export function defaultLandingPath(user: AuthUser | null | undefined): string {
  return isPortalOnlyUser(user) ? "/portal" : "/dashboard"
}

/** Whether a nav path's permission allows the user to land there directly. */
export function canAccessPath(user: AuthUser | null | undefined, path: string): boolean {
  if (!user) return false
  if (path === "/portal") return canUser(user, "portal:view")
  if (path === "/dashboard") return canUser(user, "dashboard:view")
  return true
}