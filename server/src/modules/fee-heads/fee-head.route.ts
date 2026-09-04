import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createFeeHeadHandler,
  getFeeHeadHandler,
  listFeeHeadsHandler,
  updateFeeHeadHandler,
} from "./fee-head.controller.js"

// Fee heads are tenant-scoped master data referenced by future fee structures.
// There is intentionally NO DELETE — a fee head may be referenced by fee
// structure items, so it is only ever updated, never removed.
export const feeHeadsRouter: Router = Router()

feeHeadsRouter.use(requireAuth)

feeHeadsRouter.get("/", requirePermission("fees:view"), listFeeHeadsHandler)
feeHeadsRouter.post("/", requirePermission("fees:create"), createFeeHeadHandler)
feeHeadsRouter.get("/:id", requirePermission("fees:view"), getFeeHeadHandler)
feeHeadsRouter.patch("/:id", requirePermission("fees:update"), updateFeeHeadHandler)
