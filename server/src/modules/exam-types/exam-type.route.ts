import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createExamTypeHandler,
  getExamTypeHandler,
  listExamTypesHandler,
  updateExamTypeHandler,
} from "./exam-type.controller.js"

// Exam types are tenant-scoped master data referenced by future examinations.
// There is intentionally NO DELETE — an exam type may be referenced by exam
// records, so it is only ever updated, never removed.
export const examTypesRouter: Router = Router()

examTypesRouter.use(requireAuth)

examTypesRouter.get("/", requirePermission("exams:view"), listExamTypesHandler)
examTypesRouter.post("/", requirePermission("exams:create"), createExamTypeHandler)
examTypesRouter.get("/:id", requirePermission("exams:view"), getExamTypeHandler)
examTypesRouter.patch("/:id", requirePermission("exams:update"), updateExamTypeHandler)
