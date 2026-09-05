import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  exportAuditLogsHandler,
  getAuditLogHandler,
  listAuditLogsHandler,
} from "./audit-log.controller.js"

// Audit logs are append-only: there are intentionally NO create/update/delete
// routes. All reads are tenant-scoped (schoolId filtered server-side).
export const auditLogsRouter: Router = Router()

auditLogsRouter.get(
  "/export",
  requireAuth,
  requirePermission("audit-logs:export"),
  exportAuditLogsHandler,
)

auditLogsRouter.get("/", requireAuth, requirePermission("audit-logs:view"), listAuditLogsHandler)

auditLogsRouter.get(
  "/:id",
  requireAuth,
  requirePermission("audit-logs:view"),
  getAuditLogHandler,
)