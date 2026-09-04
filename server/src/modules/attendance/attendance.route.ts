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

export const attendanceRouter: Router = Router()

attendanceRouter.use(requireAuth)

attendanceRouter.get("/", requirePermission("attendance:view"), listAttendanceRecordsHandler)
attendanceRouter.post("/", requirePermission("attendance:create"), markAttendanceHandler)
attendanceRouter.post("/bulk", requirePermission("attendance:create"), bulkMarkAttendanceHandler)
attendanceRouter.get("/summary", requirePermission("attendance:view"), getAttendanceSummaryHandler)
attendanceRouter.get("/:id", requirePermission("attendance:view"), getAttendanceRecordHandler)
attendanceRouter.patch("/:id", requirePermission("attendance:update"), updateAttendanceRecordHandler)
attendanceRouter.delete("/:id", requirePermission("attendance:update"), deleteAttendanceRecordHandler)
