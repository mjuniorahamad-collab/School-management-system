import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  getReportCardSchemeHandler,
  listReportCardSchemesHandler,
  upsertReportCardSchemeHandler,
} from "./report-card-scheme.controller.js"

// Report Card scheme configuration (docs/report-card.md §2). Reading respects
// the existing `report-cards:view`; authoring the aggregation policy requires
// the dedicated `report-cards:manage-schemes` so generating a card never implies
// the ability to change the rules it is generated under.
//
// There is intentionally NO DELETE: a scheme's identity is its
// (session, class, section) scope, so it is upserted idempotently via PUT rather
// than split into create/update. Removing a scheme would silently change what
// future cards aggregate under, so it is deliberately unsupported in V1.
export const reportCardSchemesRouter: Router = Router()

reportCardSchemesRouter.use(requireAuth)

reportCardSchemesRouter.get("/", requirePermission("report-cards:view"), listReportCardSchemesHandler)
reportCardSchemesRouter.put(
  "/",
  requirePermission("report-cards:manage-schemes"),
  upsertReportCardSchemeHandler,
)
reportCardSchemesRouter.get("/:id", requirePermission("report-cards:view"), getReportCardSchemeHandler)
