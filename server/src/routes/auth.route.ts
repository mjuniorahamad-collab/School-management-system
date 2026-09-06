import { Router } from "express"
import { env } from "../config/env.js"
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from "../controllers/auth.controller.js"
import { requireAuth } from "../middleware/requireAuth.js"
import { rateLimit } from "../middleware/rateLimit.js"

export const authRouter: Router = Router()

// Public but credential-fed routes are rate-limited to blunt brute-force and
// per-request scrypt CPU abuse. The limiter is skipped in test/CI where it
// would otherwise slow the auth smoke suite.
const authRateLimitEnabled = env.nodeEnv !== "test"
const authRateLimit = rateLimit({
  limit: env.authRateLimit.max,
  windowMs: env.authRateLimit.windowMs,
  enabled: authRateLimitEnabled,
})

authRouter.post("/login", authRateLimit, loginHandler)
authRouter.post("/refresh", authRateLimit, refreshHandler)

// Everything below requires an authenticated session.
authRouter.use(requireAuth)
authRouter.get("/me", meHandler)
authRouter.post("/logout", logoutHandler)