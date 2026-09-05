import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  getAttendanceHandler,
  getBirthdayStudentsHandler,
  getFeeAnalyticsHandler,
  getFeeCollectionStatusHandler,
  getImportantNoticesHandler,
  getRecentActivityHandler,
  getRecentStudentsHandler,
  getStatsHandler,
  getTopClassesHandler,
  getUpcomingEventsHandler,
} from "./dashboard.controller.js"

// Dashboard module. All endpoints are read-only, tenant-scoped aggregation.
// The school is resolved server-side from the authenticated session.
export const dashboardRouter: Router = Router()

dashboardRouter.use(requireAuth)

dashboardRouter.get("/stats", requirePermission("dashboard:view"), getStatsHandler)
dashboardRouter.get("/attendance", requirePermission("dashboard:view"), getAttendanceHandler)
dashboardRouter.get("/fees", requirePermission("dashboard:view"), getFeeAnalyticsHandler)
dashboardRouter.get(
  "/fee-status",
  requirePermission("dashboard:view"),
  getFeeCollectionStatusHandler,
)
dashboardRouter.get("/top-classes", requirePermission("dashboard:view"), getTopClassesHandler)
dashboardRouter.get("/recent-students", requirePermission("dashboard:view"), getRecentStudentsHandler)
dashboardRouter.get("/events", requirePermission("dashboard:view"), getUpcomingEventsHandler)
dashboardRouter.get("/notices", requirePermission("dashboard:view"), getImportantNoticesHandler)
dashboardRouter.get("/activity", requirePermission("dashboard:view"), getRecentActivityHandler)
dashboardRouter.get("/birthdays", requirePermission("dashboard:view"), getBirthdayStudentsHandler)
