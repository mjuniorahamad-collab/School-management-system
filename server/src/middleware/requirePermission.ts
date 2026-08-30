import type { RequestHandler } from "express"
import { hasPermission } from "../auth/hasPermission.js"
import { forbiddenError, unauthorizedError } from "../lib/ApiError.js"
import type { PermissionCode } from "../permissions/permissions.js"

/**
 * Guards a route behind one or more permission codes (ANY semantics).
 * Must be mounted after `requireAuth` so `req.auth` is populated.
 *
 *   router.get("/students", requireAuth, requirePermission("students:view"), handler)
 */
export function requirePermission(...required: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorizedError("Authentication required"))
      return
    }
    if (hasPermission(req.auth.roles, new Set(req.auth.permissions), required)) {
      next()
      return
    }
    next(forbiddenError())
  }
}