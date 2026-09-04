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

export const timetableRouter: Router = Router()

timetableRouter.use(requireAuth)

timetableRouter.get("/", requirePermission("timetable:view"), listTimetableEntriesHandler)
timetableRouter.post("/", requirePermission("timetable:create"), createTimetableEntryHandler)
timetableRouter.get("/:id", requirePermission("timetable:view"), getTimetableEntryHandler)
timetableRouter.patch("/:id", requirePermission("timetable:update"), updateTimetableEntryHandler)
timetableRouter.delete("/:id", requirePermission("timetable:delete"), deleteTimetableEntryHandler)
timetableRouter.post("/copy-day", requirePermission("timetable:create"), copyTimetableDayHandler)
