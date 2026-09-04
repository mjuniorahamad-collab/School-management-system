import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createTeacherHandler,
  getTeacherHandler,
  getTeacherMetaHandler,
  listTeachersHandler,
  updateTeacherHandler,
} from "./teacher.controller.js"

// Teachers module. Every route requires an authenticated session; each action
// is guarded by a capability permission. There is intentionally NO DELETE —
// lifecycle changes (status) are handled through PATCH /:id instead.
export const teachersRouter: Router = Router()

teachersRouter.use(requireAuth)

teachersRouter.get("/", requirePermission("teachers:view"), listTeachersHandler)
teachersRouter.get("/meta", requirePermission("teachers:view"), getTeacherMetaHandler)
teachersRouter.post("/", requirePermission("teachers:create"), createTeacherHandler)
teachersRouter.get("/:id", requirePermission("teachers:view"), getTeacherHandler)
teachersRouter.patch("/:id", requirePermission("teachers:update"), updateTeacherHandler)
