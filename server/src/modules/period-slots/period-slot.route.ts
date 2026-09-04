import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createPeriodSlotHandler,
  getPeriodSlotHandler,
  listPeriodSlotsHandler,
  updatePeriodSlotHandler,
} from "./period-slot.controller.js"

// Period slots are tenant-scoped master data referenced by the timetable.
// There is intentionally NO DELETE — a period may be referenced by timetable
// entries, so it is only ever updated, never removed.
export const periodSlotsRouter: Router = Router()

periodSlotsRouter.use(requireAuth)

periodSlotsRouter.get("/", requirePermission("timetable:view"), listPeriodSlotsHandler)
periodSlotsRouter.post("/", requirePermission("timetable:create"), createPeriodSlotHandler)
periodSlotsRouter.get("/:id", requirePermission("timetable:view"), getPeriodSlotHandler)
periodSlotsRouter.patch("/:id", requirePermission("timetable:update"), updatePeriodSlotHandler)
