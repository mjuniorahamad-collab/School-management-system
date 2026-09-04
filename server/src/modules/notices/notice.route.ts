import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createNoticeHandler,
  deleteNoticeHandler,
  getNoticeHandler,
  listNoticesHandler,
  updateNoticeHandler,
} from "./notice.controller.js"

// Notices module. Tenant-scoped; the school is always resolved server-side from
// the authenticated session, so a caller can only manage notices in their own
// tenant. Publish lifecycle is DRAFT → PUBLISHED → ARCHIVED (PATCH status).
export const noticesRouter: Router = Router()

noticesRouter.use(requireAuth)

noticesRouter.get("/", requirePermission("notices:view"), listNoticesHandler)
noticesRouter.post("/", requirePermission("notices:create"), createNoticeHandler)
noticesRouter.get("/:id", requirePermission("notices:view"), getNoticeHandler)
noticesRouter.patch("/:id", requirePermission("notices:update"), updateNoticeHandler)
noticesRouter.delete("/:id", requirePermission("notices:delete"), deleteNoticeHandler)
