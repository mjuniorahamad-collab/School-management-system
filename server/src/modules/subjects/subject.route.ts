import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createSubjectHandler,
  getSubjectHandler,
  listSubjectsHandler,
  updateSubjectHandler,
} from "./subject.controller.js"

// Subjects module. Every route requires an authenticated session; each action
// is guarded by a capability permission. There is intentionally NO DELETE —
// subjects are master data referenced by future class-subject mappings.
export const subjectsRouter: Router = Router()

subjectsRouter.use(requireAuth)

subjectsRouter.get("/", requirePermission("subjects:view"), listSubjectsHandler)
subjectsRouter.post("/", requirePermission("subjects:create"), createSubjectHandler)
subjectsRouter.get("/:id", requirePermission("subjects:view"), getSubjectHandler)
subjectsRouter.patch("/:id", requirePermission("subjects:update"), updateSubjectHandler)
