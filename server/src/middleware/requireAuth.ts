import type { RequestHandler } from "express"
import { buildAuthUser } from "../auth/authUser.js"
import { ACCESS_COOKIE, getCookie } from "../auth/cookies.js"
import { hashToken } from "../auth/tokens.js"
import {
  ApiError,
  INTERNAL_ERROR,
  accountDisabledError,
  forbiddenError,
  unauthorizedError,
} from "../lib/ApiError.js"
import { getPrisma } from "../lib/database.js"
import { loadPrincipalContext } from "../services/auth.service.js"

const SCHOOL_HEADER = "x-school-id"

/**
 * Authenticates the request from the `sms.access` httpOnly cookie and attaches
 * `req.auth` (identity + resolved roles/permissions + server-derived tenant).
 * Requires a valid, active, non-revoked, unexpired session associated with an
 * ACTIVE user whose resolved tenant school is ACTIVE.
 *
 * A multi-school user may disambiguate their tenant with the `X-School-Id`
 * header; it is validated against an ACTIVE membership (never trusted blindly).
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

    const headerValue = req.headers[SCHOOL_HEADER]
    const requestedSchoolId =
      typeof headerValue === "string" ? headerValue.trim() : undefined

    const principal = await loadPrincipalContext(session.userId, {
      schoolId: requestedSchoolId || undefined,
    })

    if (principal.user.status !== "ACTIVE") {
      next(accountDisabledError())
      return
    }

    if (!principal.school) {
      next(forbiddenError("Your account is not associated with any school"))
      return
    }

    if (principal.school.status !== "ACTIVE") {
      next(forbiddenError("This school has been suspended"))
      return
    }

    req.auth = buildAuthUser(principal.user, principal.school, principal.roles, principal.permissions)
    next()
  } catch (error) {
    next(error)
  }
}