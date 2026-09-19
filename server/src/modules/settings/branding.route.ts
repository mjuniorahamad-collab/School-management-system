import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { getBrandingHandler } from "./setting.controller.js"

// Tenant-scoped branding projection for the application chrome. Readable by any
// authenticated user of a school (no permission beyond auth) — it returns only
// schoolName/tagline resolved from the canonical SchoolSetting store, never the
// full settings payload that stays behind `settings:view`.
export const brandingRouter: Router = Router()

brandingRouter.use(requireAuth)

brandingRouter.get("/", getBrandingHandler)