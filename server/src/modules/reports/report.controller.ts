import type { RequestHandler } from "express"
import { hasPermission } from "../../auth/hasPermission.js"
import { parseWithZod } from "../../lib/validation.js"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { REPORT_CATALOG } from "./report.catalog.js"
import { examOptionsQuerySchema, reportKeyParamSchema, reportQuerySchemaFor } from "./report.schema.js"
import { exportReport, listReportExamOptions, runReport } from "./report.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listCatalogHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const permissions = new Set(auth.permissions)
  const catalog = REPORT_CATALOG.filter((entry) => hasPermission(auth.roles, permissions, entry.requiredPermission)).map(
    ({ key, title, group, description }) => ({ key, title, group, description }),
  )
  res.json(ok(catalog))
}

export const getExamOptionsHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  const query = parseWithZod(examOptionsQuerySchema, req.query, "Invalid exam options query")
  res.json(ok(await listReportExamOptions(query, schoolId)))
}

export const runReportHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  const key = parseWithZod(reportKeyParamSchema, routeParam(req.params.reportKey), "Invalid report key")
  const query = parseWithZod(reportQuerySchemaFor(key), req.query, "Invalid report query")
  res.json(ok(await runReport(key, query, schoolId)))
}

export const exportReportHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const key = parseWithZod(reportKeyParamSchema, routeParam(req.params.reportKey), "Invalid report key")
  const query = parseWithZod(reportQuerySchemaFor(key), req.query, "Invalid report query")
  const result = await exportReport(key, query, auth.school.id, auth)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`)
  res.send(result.csv)
}