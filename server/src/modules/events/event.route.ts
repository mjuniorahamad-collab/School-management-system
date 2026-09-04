import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createEventHandler,
  deleteEventHandler,
  getEventHandler,
  listEventsHandler,
  updateEventHandler,
} from "./event.controller.js"

// Events module. Tenant-scoped; the school is always resolved server-side from
// the authenticated session, so a caller can only manage events in their own
// tenant.
export const eventsRouter: Router = Router()

eventsRouter.use(requireAuth)

eventsRouter.get("/", requirePermission("events:view"), listEventsHandler)
eventsRouter.post("/", requirePermission("events:create"), createEventHandler)
eventsRouter.get("/:id", requirePermission("events:view"), getEventHandler)
eventsRouter.patch("/:id", requirePermission("events:update"), updateEventHandler)
eventsRouter.delete("/:id", requirePermission("events:delete"), deleteEventHandler)
