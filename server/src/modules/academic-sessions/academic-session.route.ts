import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createSessionHandler,
  getSessionHandler,
  listSessionsHandler,
  updateSessionHandler,
} from "./academic-session.controller.js"

// Academic Sessions module. Every route requires an authenticated session; each
// action is guarded by a capability permission. There is intentionally NO
// DELETE — sessions are closed (status) rather than removed to preserve
// enrollment history.
export const academicSessionsRouter: Router = Router()

academicSessionsRouter.use(requireAuth)

academicSessionsRouter.get("/", requirePermission("academic-sessions:view"), listSessionsHandler)
academicSessionsRouter.post("/", requirePermission("academic-sessions:create"), createSessionHandler)
academicSessionsRouter.get("/:id", requirePermission("academic-sessions:view"), getSessionHandler)
academicSessionsRouter.patch("/:id", requirePermission("academic-sessions:update"), updateSessionHandler)
