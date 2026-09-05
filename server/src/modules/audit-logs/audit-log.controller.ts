import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import { listAuditLogsQuerySchema } from "./audit-log.schema.js"
import * as auditLogService from "./audit-log.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listAuditLogsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAuditLogsQuerySchema, req.query, "Invalid audit logs query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await auditLogService.listAuditLogs(query, schoolId)))
}

export const getAuditLogHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await auditLogService.getAuditLogById(routeParam(req.params.id), schoolId)))
}

export const exportAuditLogsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAuditLogsQuerySchema, req.query, "Invalid audit logs export query")
  const { schoolId } = requireAuth(req)
  const csv = await auditLogService.exportAuditLogsCsv(query, schoolId)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", 'attachment; filename="audit-logs.csv"')
  res.send(csv)
}