import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createClassHandler,
  getClassHandler,
  listClassesHandler,
  updateClassHandler,
} from "./class.controller.js"

// Classes module. Every route requires an authenticated session; each action is
// guarded by a capability permission. There is intentionally NO DELETE —
// deleting a class would cascade-delete its sections and student enrollments.
export const classesRouter: Router = Router()

classesRouter.use(requireAuth)

classesRouter.get("/", requirePermission("classes:view"), listClassesHandler)
classesRouter.post("/", requirePermission("classes:create"), createClassHandler)
classesRouter.get("/:id", requirePermission("classes:view"), getClassHandler)
classesRouter.patch("/:id", requirePermission("classes:update"), updateClassHandler)
