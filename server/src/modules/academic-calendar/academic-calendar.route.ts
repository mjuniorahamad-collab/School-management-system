import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  confirmCalendarDayHandler,
  confirmCalendarHandler,
  createCalendarDayHandler,
  deleteCalendarDayHandler,
  getCalendarHandler,
  listCalendarDaysHandler,
  listCalendarsHandler,
  updateCalendarDayHandler,
  upsertCalendarHandler,
} from "./academic-calendar.controller.js"

// Academic calendar authoring (docs/academic-calendar.md §12). Every route —
// including reads — is gated on the dedicated `calendar:manage` permission; the
// calendar is an authoring surface, not general academic-session data.
export const academicCalendarRouter: Router = Router()

academicCalendarRouter.use(requireAuth)

// `/days` routes are registered BEFORE `/:academicSessionId` so the literal
// segment is never captured as a session id.
academicCalendarRouter.get("/days", requirePermission("calendar:manage"), listCalendarDaysHandler)
academicCalendarRouter.post("/days", requirePermission("calendar:manage"), createCalendarDayHandler)
academicCalendarRouter.patch("/days/:id", requirePermission("calendar:manage"), updateCalendarDayHandler)
academicCalendarRouter.delete("/days/:id", requirePermission("calendar:manage"), deleteCalendarDayHandler)
academicCalendarRouter.post(
  "/days/:id/confirm",
  requirePermission("calendar:manage"),
  confirmCalendarDayHandler,
)

academicCalendarRouter.get("/", requirePermission("calendar:manage"), listCalendarsHandler)
academicCalendarRouter.get("/:academicSessionId", requirePermission("calendar:manage"), getCalendarHandler)
academicCalendarRouter.put("/:academicSessionId", requirePermission("calendar:manage"), upsertCalendarHandler)
academicCalendarRouter.post(
  "/:academicSessionId/confirm",
  requirePermission("calendar:manage"),
  confirmCalendarHandler,
)
