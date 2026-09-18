import type { RequestHandler } from "express"
import { setAuthCookies } from "../../auth/cookies.js"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import { createSessionTokens } from "../../services/auth.service.js"
import type { AuthUser } from "../../types/auth.js"
import {
  activatePortalAccountSchema,
  createProfileLinkSchema,
  deleteProfileLinkSchema,
  portalListQuerySchema,
  portalNoticesQuerySchema,
  provisionPortalAccountSchema,
  regenerateActivationSchema,
} from "./portal.schema.js"
import * as portalProvisioningService from "./portal-provisioning.service.js"
import * as portalService from "./portal.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const getOverviewHandler: RequestHandler = async (req, res) => {
  res.json(ok(await portalService.getOverview(requireAuth(req))))
}

export const listChildrenHandler: RequestHandler = async (req, res) => {
  res.json(ok(await portalService.getChildren(requireAuth(req))))
}

export const getChildHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await portalService.getChild(auth, routeParam(req.params.studentId))))
}

export const getAttendanceHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(portalListQuerySchema, req.query, "Invalid attendance query")
  const auth = requireAuth(req)
  res.json(
    ok(await portalService.getAttendance(auth, routeParam(req.params.studentId), query.sessionId)),
  )
}

export const getFeesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(portalListQuerySchema, req.query, "Invalid fees query")
  const auth = requireAuth(req)
  res.json(ok(await portalService.getFees(auth, routeParam(req.params.studentId), query.sessionId)))
}

export const getResultsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(portalListQuerySchema, req.query, "Invalid results query")
  const auth = requireAuth(req)
  res.json(ok(await portalService.getResults(auth, routeParam(req.params.studentId), query.sessionId)))
}

export const getTasksHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(portalListQuerySchema, req.query, "Invalid tasks query")
  const auth = requireAuth(req)
  res.json(ok(await portalService.getTasks(auth, routeParam(req.params.studentId), query.sessionId)))
}

export const getTransportHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(portalListQuerySchema, req.query, "Invalid transport query")
  const auth = requireAuth(req)
  res.json(
    ok(await portalService.getTransport(auth, routeParam(req.params.studentId), query.sessionId)),
  )
}

export const getLibraryLoansHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await portalService.getLibraryLoans(auth, routeParam(req.params.studentId))))
}

export const getNoticesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(portalNoticesQuerySchema, req.query, "Invalid notices query")
  const auth = requireAuth(req)
  res.json(ok(await portalService.getNotices(auth, query.limit)))
}

export const createLinkHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createProfileLinkSchema, req.body, "Invalid link data")
  const result = await portalService.linkProfile(requireAuth(req), input)
  res.status(201).json(ok(result))
}

export const deleteLinkHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(deleteProfileLinkSchema, req.body, "Invalid unlink data")
  const result = await portalService.unlinkProfile(requireAuth(req), input)
  res.json(ok(result))
}

export const listLinksHandler: RequestHandler = async (req, res) => {
  res.json(ok(await portalService.listLinks(requireAuth(req))))
}

export const getLinkCandidatesHandler: RequestHandler = async (req, res) => {
  res.json(ok(await portalService.getLinkCandidates(requireAuth(req))))
}

export const provisionAccountHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(provisionPortalAccountSchema, req.body, "Invalid provisioning data")
  const result = await portalProvisioningService.provisionPortalAccount(requireAuth(req), input)
  res.status(201).json(ok(result))
}

export const regenerateActivationHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(regenerateActivationSchema, req.body, "Invalid regeneration data")
  const result = await portalProvisioningService.regenerateActivation(
    requireAuth(req),
    input.userId,
  )
  res.json(ok(result))
}

export const activatePortalAccountHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(activatePortalAccountSchema, req.body, "Invalid activation data")
  const result = await portalProvisioningService.activatePortalAccount(
    input.token,
    input.newPassword,
  )
  // Requested behaviour: activation signs the parent straight in. The session
  // machinery is identical to a normal login (rotating opaque tokens, hashed in
  // the DB, httpOnly cookies) — the raw token never reaches browser JS.
  const tokens = await createSessionTokens(result.user.id)
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken)
  res.json(ok(result))
}