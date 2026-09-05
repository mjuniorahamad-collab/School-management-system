import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  finalizeExamHandler,
  getResultSheetHandler,
  putSubjectMarksHandler,
  reopenExamHandler,
} from "./result.controller.js"

export const resultRouter: Router = Router()

resultRouter.use(requireAuth)

// Marks entry: results:update. Finalize/reopen: results:publish (admin/principal).
resultRouter.get("/exams/:examId/sheet", requirePermission("results:view"), getResultSheetHandler)
resultRouter.put(
  "/exams/:examId/subjects/:examSubjectId/marks",
  requirePermission("results:update"),
  putSubjectMarksHandler,
)
resultRouter.post("/exams/:examId/finalize", requirePermission("results:publish"), finalizeExamHandler)
resultRouter.post("/exams/:examId/reopen", requirePermission("results:publish"), reopenExamHandler)