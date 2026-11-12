import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  copyTimetableDayHandler,
  createTimetableEntryHandler,
  deleteTimetableEntryHandler,
  getTimetableEntryHandler,
  listTimetableEntriesHandler,
  updateTimetableEntryHandler,
} from "./timetable.controller.js"
import { requireTimetableManage, requireTimetableViewScope } from "./timetable.scope.js"

export const timetableRouter: Router = Router()

timetableRouter.use(requireAuth)

timetableRouter.get("/", requirePermission("timetable:view"), requireTimetableViewScope, listTimetableEntriesHandler)
timetableRouter.post("/", requirePermission("timetable:create"), requireTimetableManage, createTimetableEntryHandler)
timetableRouter.get("/:id", requirePermission("timetable:view"), requireTimetableViewScope, getTimetableEntryHandler)
timetableRouter.patch("/:id", requirePermission("timetable:update"), requireTimetableManage, updateTimetableEntryHandler)
timetableRouter.delete("/:id", requirePermission("timetable:delete"), requireTimetableManage, deleteTimetableEntryHandler)
timetableRouter.post("/copy-day", requirePermission("timetable:create"), requireTimetableManage, copyTimetableDayHandler)
