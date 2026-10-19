import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import { correctPeriodSchema, listPeriodsQuerySchema } from "./enrollment-history.schema.js"
import * as enrollmentHistoryService from "./enrollment-history.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listPeriodsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listPeriodsQuerySchema, req.query, "Invalid enrollment period query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await enrollmentHistoryService.listPeriods(query, schoolId)))
}

export const correctPeriodHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(correctPeriodSchema, req.body, "Invalid enrollment period data")
  const auth = requireAuth(req)
  res.json(
    ok(await enrollmentHistoryService.correctPeriod(routeParam(req.params.id), input, auth.school.id, auth)),
  )
}

export const confirmPeriodHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await enrollmentHistoryService.confirmPeriod(routeParam(req.params.id), auth.school.id, auth)))
}
