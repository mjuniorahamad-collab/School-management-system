import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createSectionHandler,
  getSectionHandler,
  listSectionsHandler,
  updateSectionHandler,
} from "./section.controller.js"

// Sections module. Every route requires an authenticated session; each action
// is guarded by a capability permission. There is intentionally NO DELETE —
// deleting a section would cascade-delete its student enrollments.
export const sectionsRouter: Router = Router()

sectionsRouter.use(requireAuth)

sectionsRouter.get("/", requirePermission("sections:view"), listSectionsHandler)
sectionsRouter.post("/", requirePermission("sections:create"), createSectionHandler)
sectionsRouter.get("/:id", requirePermission("sections:view"), getSectionHandler)
sectionsRouter.patch("/:id", requirePermission("sections:update"), updateSectionHandler)
