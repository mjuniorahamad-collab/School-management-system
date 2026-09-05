import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createExamHandler,
  deleteExamHandler,
  getExamContextHandler,
  getExamHandler,
  listExamsHandler,
  updateExamHandler,
  updateExamStatusHandler,
  updateExamSubjectsHandler,
} from "./exam.controller.js"

export const examRouter: Router = Router()

examRouter.use(requireAuth)

// `/context` must precede `/:id` so it is never captured as an id.
examRouter.get("/context", requirePermission("exams:view"), getExamContextHandler)
examRouter.get("/", requirePermission("exams:view"), listExamsHandler)
examRouter.post("/", requirePermission("exams:create"), createExamHandler)
// Finalize/reopen (FINAL) are mounted under results:publish in the results router.
examRouter.put("/:id/subjects", requirePermission("exams:update"), updateExamSubjectsHandler)
examRouter.patch("/:id/status", requirePermission("exams:update"), updateExamStatusHandler)
examRouter.get("/:id", requirePermission("exams:view"), getExamHandler)
examRouter.patch("/:id", requirePermission("exams:update"), updateExamHandler)
examRouter.delete("/:id", requirePermission("exams:delete"), deleteExamHandler)