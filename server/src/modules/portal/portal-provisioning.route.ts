import { Router } from "express"
import { env } from "../../config/env.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { rateLimit } from "../../middleware/rateLimit.js"
import {
  activatePortalAccountHandler,
  provisionAccountHandler,
  regenerateActivationHandler,
} from "./portal.controller.js"

// Admin-side portal account provisioning (create parent accounts, issue and
// regenerate one-time activation links). Guarded by `portal:update` so parents
// and students can never provision accounts themselves.
export const portalAccountRouter: Router = Router()

portalAccountRouter.use(requireAuth, requirePermission("portal:update"))

portalAccountRouter.post("/", provisionAccountHandler)
portalAccountRouter.post("/regenerate", regenerateActivationHandler)

// Public, credential-fed activation — rate-limited like login/refresh to blunt
// brute-force and per-request scrypt CPU abuse (limiter skipped in test/CI).
export const portalActivationRouter: Router = Router()

const activationRateLimitEnabled = env.nodeEnv !== "test"

portalActivationRouter.post(
  "/",
  rateLimit({
    limit: env.authRateLimit.max,
    windowMs: env.authRateLimit.windowMs,
    enabled: activationRateLimitEnabled,
  }),
  activatePortalAccountHandler,
)