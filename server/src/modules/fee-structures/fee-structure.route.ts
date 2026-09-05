import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createFeeStructureHandler,
  getFeeStructureHandler,
  listFeeStructuresHandler,
  updateFeeStructureHandler,
} from "./fee-structure.controller.js"

// Fee structures define the tenant-configured fee components for a class within
// an academic session. One structure per class per session (DB-enforced).
// There is intentionally NO DELETE — structures may back generated invoices;
// deactivation (`isActive: false`) is the lifecycle control instead.
export const feeStructuresRouter: Router = Router()

feeStructuresRouter.use(requireAuth)

feeStructuresRouter.get("/", requirePermission("fees:view"), listFeeStructuresHandler)
feeStructuresRouter.post("/", requirePermission("fees:create"), createFeeStructureHandler)
feeStructuresRouter.get("/:id", requirePermission("fees:view"), getFeeStructureHandler)
feeStructuresRouter.patch("/:id", requirePermission("fees:update"), updateFeeStructureHandler)