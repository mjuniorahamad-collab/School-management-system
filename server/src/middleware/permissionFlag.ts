import type { RequestHandler } from "express"
import { hasPermission } from "../auth/hasPermission.js"
import type { PermissionCode } from "../permissions/permissions.js"

/**
 * Resolves an effective permission without rejecting the request and exposes it
 * as a boolean on `res.locals[flagName]`. Must be mounted after `requireAuth`.
 *
 * Use this for optional data filtering inside an endpoint that is guarded by a
 * broader permission (for example, hiding fee activity from dashboard viewers
 * who cannot read fees).
 */
export function permissionFlag(flagName: string, code: PermissionCode): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.locals[flagName] = false
      next()
      return
    }
    res.locals[flagName] = hasPermission(
      req.auth.roles,
      new Set(req.auth.permissions),
      [code],
    )
    next()
  }
}
