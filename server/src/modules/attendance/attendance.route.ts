import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  bulkMarkAttendanceHandler,
  deleteAttendanceRecordHandler,
  getAttendanceRecordHandler,
  getAttendanceSummaryHandler,
  listAttendanceRecordsHandler,
  markAttendanceHandler,
  updateAttendanceRecordHandler,
} from "./attendance.controller.js"
import {
  getRegisterHandler,
  listRegistersHandler,
  openRegisterHandler,
  submitRegisterHandler,
  verifyRegisterHandler,
} from "./attendance-register.controller.js"

export const attendanceRouter: Router = Router()

attendanceRouter.use(requireAuth)

attendanceRouter.get("/", requirePermission("attendance:view"), listAttendanceRecordsHandler)
attendanceRouter.post("/", requirePermission("attendance:create"), markAttendanceHandler)
attendanceRouter.post("/bulk", requirePermission("attendance:create"), bulkMarkAttendanceHandler)
attendanceRouter.get("/summary", requirePermission("attendance:view"), getAttendanceSummaryHandler)

// Register completeness (docs/academic-calendar.md §8). Registered BEFORE the
// `/:id` routes so "registers" is never captured as a record id. Submission and
// verification reuse the attendance-management permissions — no new codes (§12).
attendanceRouter.get("/registers", requirePermission("attendance:view"), listRegistersHandler)
attendanceRouter.post("/registers", requirePermission("attendance:update"), openRegisterHandler)
attendanceRouter.get("/registers/:id", requirePermission("attendance:view"), getRegisterHandler)
attendanceRouter.post(
  "/registers/:id/submit",
  requirePermission("attendance:update"),
  submitRegisterHandler,
)
attendanceRouter.post(
  "/registers/:id/verify",
  requirePermission("attendance:update"),
  verifyRegisterHandler,
)

attendanceRouter.get("/:id", requirePermission("attendance:view"), getAttendanceRecordHandler)
attendanceRouter.patch("/:id", requirePermission("attendance:update"), updateAttendanceRecordHandler)
attendanceRouter.delete("/:id", requirePermission("attendance:update"), deleteAttendanceRecordHandler)
