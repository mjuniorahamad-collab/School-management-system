import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  approveAdjustmentHandler,
  cancelAdjustmentHandler,
  getAdjustmentByIdHandler,
  listAdjustmentsHandler,
  overrideAdjustmentHandler,
  rejectAdjustmentHandler,
  requestAdjustmentHandler,
  reverseAdjustmentHandler,
} from "./fee-adjustment.controller.js"

export const feeAdjustmentsRouter: Router = Router()

feeAdjustmentsRouter.use(requireAuth)

feeAdjustmentsRouter.get("/", requirePermission("concessions:view"), listAdjustmentsHandler)
feeAdjustmentsRouter.get("/:id", requirePermission("concessions:view"), getAdjustmentByIdHandler)
feeAdjustmentsRouter.post("/", requirePermission("concessions:request"), requestAdjustmentHandler)
feeAdjustmentsRouter.post("/:id/approve", requirePermission("concessions:approve"), approveAdjustmentHandler)
feeAdjustmentsRouter.post("/:id/override", requirePermission("concessions:override"), overrideAdjustmentHandler)
feeAdjustmentsRouter.post("/:id/reject", requirePermission("concessions:reject"), rejectAdjustmentHandler)
feeAdjustmentsRouter.post("/:id/cancel", requirePermission("concessions:request"), cancelAdjustmentHandler)
feeAdjustmentsRouter.post("/:id/reverse", requirePermission("concessions:reverse"), reverseAdjustmentHandler)