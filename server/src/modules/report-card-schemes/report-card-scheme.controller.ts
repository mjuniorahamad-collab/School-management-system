import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  listReportCardSchemesQuerySchema,
  upsertReportCardSchemeSchema,
} from "./report-card-scheme.schema.js"
import * as reportCardSchemeService from "./report-card-scheme.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listReportCardSchemesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(
    listReportCardSchemesQuerySchema,
    req.query,
    "Invalid report card schemes list query",
  )
  const schoolId = requireAuth(req).school.id
  res.json(ok(await reportCardSchemeService.listReportCardSchemes(query, schoolId)))
}

export const getReportCardSchemeHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await reportCardSchemeService.getReportCardSchemeById(routeParam(req.params.id), schoolId)))
}

export const upsertReportCardSchemeHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(
    upsertReportCardSchemeSchema,
    req.body,
    "Invalid report card scheme data",
  )
  const auth = requireAuth(req)
  res.json(ok(await reportCardSchemeService.upsertReportCardScheme(input, auth.school.id, auth)))
}
