import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  confirmPeriodHandler,
  correctPeriodHandler,
  listPeriodsHandler,
} from "./enrollment-history.controller.js"

// Historical placement history (docs/academic-calendar.md §10a/§12). Every route
// is behind the dedicated `enrollment:history:manage` permission — rewriting or
// even reading placement history must not rest on `students:update` alone.
export const enrollmentHistoryRouter: Router = Router()

enrollmentHistoryRouter.use(requireAuth)

enrollmentHistoryRouter.get("/", requirePermission("enrollment:history:manage"), listPeriodsHandler)
enrollmentHistoryRouter.patch(
  "/:id",
  requirePermission("enrollment:history:manage"),
  correctPeriodHandler,
)
enrollmentHistoryRouter.post(
  "/:id/confirm",
  requirePermission("enrollment:history:manage"),
  confirmPeriodHandler,
)
