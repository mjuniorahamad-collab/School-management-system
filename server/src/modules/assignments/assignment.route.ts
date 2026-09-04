import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createAssignmentHandler,
  deleteAssignmentHandler,
  getAssignmentContextHandler,
  getAssignmentHandler,
  listAssignmentsHandler,
  updateAssignmentHandler,
} from "./assignment.controller.js"

export const assignmentRouter: Router = Router()

assignmentRouter.use(requireAuth)

// `/context` must precede `/:id` so it is never captured as an id.
assignmentRouter.get("/context", requirePermission("assignments:view"), getAssignmentContextHandler)
assignmentRouter.get("/", requirePermission("assignments:view"), listAssignmentsHandler)
assignmentRouter.post("/", requirePermission("assignments:create"), createAssignmentHandler)
assignmentRouter.get("/:id", requirePermission("assignments:view"), getAssignmentHandler)
assignmentRouter.patch("/:id", requirePermission("assignments:update"), updateAssignmentHandler)
assignmentRouter.delete("/:id", requirePermission("assignments:delete"), deleteAssignmentHandler)