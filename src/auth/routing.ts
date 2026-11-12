import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { getAllNavItems } from "@/routes/navigation"

const STUDENT_EDIT_PATH = /^\/students\/[^/]+\/edit$/

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? ""
  if (pathOnly === "*") return "*"

  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "")
  return withoutTrailingSlash || "/"
}

/**
 * Resolves the permission required to access a path from the navigation
 * registry. Returns null when no nav item owns the path.
 */
export function requiredPermissionForPath(pathname: string): string | null {
  const normalizedPath = normalizePathname(pathname)
  if (normalizedPath === "/" || normalizedPath === "*" || normalizedPath === "/*") {
    return null
  }

  if (normalizedPath === "/students/new") return "students:create"
  if (STUDENT_EDIT_PATH.test(normalizedPath)) return "students:update"

  const navItems = getAllNavItems()
  const exactMatch = navItems.find((item) => item.path === normalizedPath)
  if (exactMatch) return exactMatch.requiredPermission

  const prefixMatch = navItems
    .filter((item) => normalizedPath.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]

  return prefixMatch?.requiredPermission ?? null
}

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

  const requiredPermission = requiredPermissionForPath(path)
  if (requiredPermission === null) return true

  return canUser(user, requiredPermission)
}

/**
 * Landing page that is safe to link or redirect to.
 *
 * Loop protection: never return the default landing page when the user cannot
 * access it. Fall back to `/portal` only when `portal:view` is effective.
 * Returning null means there is no safe destination, so callers must show a
 * non-redirecting state instead of navigating in a cycle.
 */
export function accessibleLandingPath(user: AuthUser | null | undefined): string | null {
  if (!user) return null

  const landingPath = defaultLandingPath(user)
  if (canAccessPath(user, landingPath)) return landingPath

  if (canUser(user, "portal:view") && canAccessPath(user, "/portal")) return "/portal"

  return null
}

/**
 * Resolves the post-login destination. A denied `from` path is discarded in
 * favour of the safe landing page; the requested path is never revisited.
 */
export function resolvePostLoginPath(user: AuthUser | null | undefined, from: string | undefined): string {
  if (from && canAccessPath(user, from)) return from

  return accessibleLandingPath(user) ?? defaultLandingPath(user)
}