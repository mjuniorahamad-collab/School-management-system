import type { RequestHandler } from "express"
import { buildAuthUser } from "../auth/authUser.js"
import { ACCESS_COOKIE, getCookie } from "../auth/cookies.js"
import { hashToken } from "../auth/tokens.js"
import {
  ApiError,
  INTERNAL_ERROR,
  accountDisabledError,
  unauthorizedError,
} from "../lib/ApiError.js"
import { getPrisma } from "../lib/database.js"
import { loadPrincipalContext } from "../services/auth.service.js"

/**
 * Authenticates the request from the `sms.access` httpOnly cookie and attaches
 * `req.auth` (identity + resolved roles/permissions). Requires a valid, active,
 * non-revoked, unexpired session associated with an ACTIVE user.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const accessToken = getCookie(req.headers.cookie, ACCESS_COOKIE)
    if (!accessToken) {
      next(unauthorizedError("Authentication required"))
      return
    }

    const prisma = await getPrisma()
    if (!prisma) {
      next(new ApiError(500, INTERNAL_ERROR, "Database is not configured"))
      return
    }

    const session = await prisma.session.findUnique({
      where: { accessTokenHash: hashToken(accessToken) },
    })

    if (!session || session.revokedAt || session.accessExpiresAt <= new Date()) {
      next(unauthorizedError("Session has expired. Please sign in again."))
      return
    }

    const principal = await loadPrincipalContext(session.userId)
    if (principal.user.status !== "ACTIVE") {
      next(accountDisabledError())
      return
    }

    req.auth = buildAuthUser(principal.user, principal.roles, principal.permissions)
    next()
  } catch (error) {
    next(error)
  }
}