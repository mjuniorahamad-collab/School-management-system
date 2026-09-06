import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createLinkHandler,
  deleteLinkHandler,
  getAttendanceHandler,
  getChildHandler,
  getFeesHandler,
  getLibraryLoansHandler,
  getLinkCandidatesHandler,
  getNoticesHandler,
  getOverviewHandler,
  getResultsHandler,
  getTasksHandler,
  getTransportHandler,
  listChildrenHandler,
  listLinksHandler,
} from "./portal.controller.js"

// Student/Parent Portal — self-service. Mounted at `/me`. Every read is
// ownership-scoped in the service: the actor may only see their own linked
// student(s). Changing a `:studentId` never exposes another student's record.
export const portalMeRouter: Router = Router()

portalMeRouter.use(requireAuth, requirePermission("portal:view"))

portalMeRouter.get("/", getOverviewHandler)
portalMeRouter.get("/children", listChildrenHandler)
portalMeRouter.get("/children/:studentId", getChildHandler)
portalMeRouter.get("/children/:studentId/attendance", getAttendanceHandler)
portalMeRouter.get("/children/:studentId/fees", getFeesHandler)
portalMeRouter.get("/children/:studentId/results", getResultsHandler)
portalMeRouter.get("/children/:studentId/tasks", getTasksHandler)
portalMeRouter.get("/children/:studentId/transport", getTransportHandler)
portalMeRouter.get("/children/:studentId/library", getLibraryLoansHandler)
portalMeRouter.get("/notices", getNoticesHandler)

// Admin-side portal link management (account provisioning). Guarded by
// `portal:update` so parents/students can never link themselves.
export const portalLinksRouter: Router = Router()

portalLinksRouter.use(requireAuth, requirePermission("portal:update"))

portalLinksRouter.get("/", listLinksHandler)
portalLinksRouter.get("/candidates", getLinkCandidatesHandler)
portalLinksRouter.post("/", createLinkHandler)
portalLinksRouter.delete("/", deleteLinkHandler)