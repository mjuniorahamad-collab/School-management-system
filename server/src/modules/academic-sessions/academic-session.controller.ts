import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createSessionSchema,
  listSessionsQuerySchema,
  updateSessionSchema,
} from "./academic-session.schema.js"
import * as academicSessionService from "./academic-session.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listSessionsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listSessionsQuerySchema, req.query, "Invalid sessions list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await academicSessionService.listSessions(query, schoolId)))
}

export const getSessionHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await academicSessionService.getSessionById(routeParam(req.params.id), schoolId)))
}

export const createSessionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createSessionSchema, req.body, "Invalid academic session data")
  const auth = requireAuth(req)
  const created = await academicSessionService.createSession(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateSessionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateSessionSchema, req.body, "Invalid academic session data")
  const auth = requireAuth(req)
  const updated = await academicSessionService.updateSession(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}
