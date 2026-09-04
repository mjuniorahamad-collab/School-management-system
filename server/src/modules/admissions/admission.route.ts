import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  convertAdmissionHandler,
  createAdmissionHandler,
  deleteAdmissionHandler,
  getAdmissionHandler,
  getAdmissionsMetaHandler,
  listAdmissionsHandler,
  reviewAdmissionHandler,
  updateAdmissionHandler,
} from "./admission.controller.js"

// Admissions module. Tenant-scoped; the school is always resolved server-side
// from the authenticated session so a caller can only manage applications in
// their own tenant. Pipeline: PENDING → (review) APPROVED / REJECTED / WITHDRAWN
// → (convert) CONVERTED → Student.
export const admissionsRouter: Router = Router()

admissionsRouter.use(requireAuth)

admissionsRouter.get("/", requirePermission("admissions:view"), listAdmissionsHandler)
admissionsRouter.get("/meta", requirePermission("admissions:view"), getAdmissionsMetaHandler)
admissionsRouter.post("/", requirePermission("admissions:create"), createAdmissionHandler)
admissionsRouter.get("/:id", requirePermission("admissions:view"), getAdmissionHandler)
admissionsRouter.patch("/:id", requirePermission("admissions:update"), updateAdmissionHandler)
admissionsRouter.post("/:id/review", requirePermission("admissions:update"), reviewAdmissionHandler)
admissionsRouter.post("/:id/convert", requirePermission("admissions:update"), convertAdmissionHandler)
admissionsRouter.delete("/:id", requirePermission("admissions:delete"), deleteAdmissionHandler)
