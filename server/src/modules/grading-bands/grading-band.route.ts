import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createGradingBandHandler,
  getGradingBandHandler,
  listGradingBandsHandler,
  updateGradingBandHandler,
} from "./grading-band.controller.js"

// Grading bands are tenant-scoped master data used to turn percentage scores
// into letter grades for Results. They are configurable (never hard-coded).
// There is intentionally NO DELETE — a band may be referenced by results.
export const gradingBandsRouter: Router = Router()

gradingBandsRouter.use(requireAuth)

gradingBandsRouter.get("/", requirePermission("results:view"), listGradingBandsHandler)
gradingBandsRouter.post("/", requirePermission("results:create"), createGradingBandHandler)
gradingBandsRouter.get("/:id", requirePermission("results:view"), getGradingBandHandler)
gradingBandsRouter.patch("/:id", requirePermission("results:update"), updateGradingBandHandler)
