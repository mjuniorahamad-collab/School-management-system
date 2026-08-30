import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createStudentHandler,
  exportStudentsHandler,
  getStudentHandler,
  getStudentsMetaHandler,
  listStudentsHandler,
  updateStudentHandler,
} from "./student.controller.js"

// Students module. Every route requires an authenticated session; each action
// is guarded by a capability permission. There is intentionally NO DELETE —
// lifecycle changes (status) are handled through PATCH /:id instead.
export const studentsRouter: Router = Router()

studentsRouter.use(requireAuth)

studentsRouter.get("/", requirePermission("students:view"), listStudentsHandler)
studentsRouter.get("/meta", requirePermission("students:view"), getStudentsMetaHandler)
studentsRouter.get("/export", requirePermission("students:export"), exportStudentsHandler)
studentsRouter.post("/", requirePermission("students:create"), createStudentHandler)
studentsRouter.get("/:id", requirePermission("students:view"), getStudentHandler)
studentsRouter.patch("/:id", requirePermission("students:update"), updateStudentHandler)