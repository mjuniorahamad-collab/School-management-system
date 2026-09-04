import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createStaffHandler,
  getStaffHandler,
  getStaffMetaHandler,
  listStaffsHandler,
  updateStaffHandler,
} from "./staff.controller.js"

// Staff module. Every route requires an authenticated session; each action
// is guarded by a capability permission. There is intentionally NO DELETE —
// lifecycle changes (status) are handled through PATCH /:id instead.
export const staffRouter: Router = Router()

staffRouter.use(requireAuth)

staffRouter.get("/", requirePermission("staff:view"), listStaffsHandler)
staffRouter.get("/meta", requirePermission("staff:view"), getStaffMetaHandler)
staffRouter.post("/", requirePermission("staff:create"), createStaffHandler)
staffRouter.get("/:id", requirePermission("staff:view"), getStaffHandler)
staffRouter.patch("/:id", requirePermission("staff:update"), updateStaffHandler)
