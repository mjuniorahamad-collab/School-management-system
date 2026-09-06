import type { RequestHandler } from "express"
import { Router } from "express"
import { hasPermission } from "../../auth/hasPermission.js"
import { forbiddenError } from "../../lib/ApiError.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { getReportDefinition } from "./report.catalog.js"
import {
  exportReportHandler,
  getExamOptionsHandler,
  listCatalogHandler,
  runReportHandler,
} from "./report.controller.js"

/**
 * Reports are view-only aggregations over authoritative module data. Every
 * route resolves the concrete report from the catalog and enforces its
 * per-report permission set (see `REPORT_CATALOG`) in addition to the base
 * `reports:view` guard — mirroring the "permission checks live on the
 * route/middleware, never inside controllers" rule. Export additionally
 * requires `reports:export` and writes an immutable audit entry.
 */
export const reportsRouter: Router = Router()

function authorizeReportPermission(): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth
    if (!auth) {
      next()
      return
    }
    const rawKey = req.params.reportKey
    const key = Array.isArray(rawKey) ? rawKey[0] ?? "" : rawKey ?? ""
    const definition = getReportDefinition(key)
    if (!definition) {
      // Unknown key: let the zod param schema reject it with a 400.
      next()
      return
    }
    if (hasPermission(auth.roles, new Set(auth.permissions), definition.requiredPermission)) {
      next()
      return
    }
    next(forbiddenError())
  }
}

reportsRouter.use(requireAuth)

reportsRouter.get("/", requirePermission("reports:view"), listCatalogHandler)
reportsRouter.get(
  "/exam-options",
  requirePermission("reports:view"),
  // Two sequential guards give AND semantics for reports+results.
  requirePermission("results:view"),
  getExamOptionsHandler,
)
reportsRouter.get("/:reportKey", requirePermission("reports:view"), authorizeReportPermission(), runReportHandler)
reportsRouter.get(
  "/:reportKey/export",
  requirePermission("reports:export"),
  authorizeReportPermission(),
  exportReportHandler,
)