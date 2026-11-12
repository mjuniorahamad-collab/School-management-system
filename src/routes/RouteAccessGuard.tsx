import type { ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { canUser } from "@/auth/can"
import { requiredPermissionForPath } from "@/auth/routing"
import { useAuth } from "@/auth/useAuth"
import { AccessDenied } from "@/components/shared/AccessDenied"

interface RouteAccessGuardProps {
  children: ReactNode
}

/**
 * Permission gate for the app shell. Authentication stays in ProtectedRoute;
 * this guard only enforces the permission resolved from the current nav path.
 *
 * Unmapped paths ("/", "*", and unknown routes) resolve to null and are left to
 * the route tree (landing redirect / 404). Page-level denials remain in place as
 * defense in depth.
 */
export function RouteAccessGuard({ children }: RouteAccessGuardProps) {
  const { user } = useAuth()
  const location = useLocation()
  const requiredPermission = requiredPermissionForPath(location.pathname)

  if (requiredPermission !== null && !canUser(user, requiredPermission)) {
    return <AccessDenied requiredPermission={requiredPermission} />
  }

  return <>{children}</>
}
