import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { getSettingsHandler, updateSettingsHandler } from "./setting.controller.js"

// Tenant-scoped school configuration. Settings are persisted in the generic
// SchoolSetting key/value store, always scoped to the authenticated school.
export const settingsRouter: Router = Router()

settingsRouter.use(requireAuth)

settingsRouter.get("/", requirePermission("settings:view"), getSettingsHandler)
settingsRouter.put("/", requirePermission("settings:update"), updateSettingsHandler)
