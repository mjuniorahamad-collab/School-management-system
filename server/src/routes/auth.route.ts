import { Router } from "express"
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from "../controllers/auth.controller.js"
import { requireAuth } from "../middleware/requireAuth.js"

export const authRouter: Router = Router()

// Public.
authRouter.post("/login", loginHandler)
authRouter.post("/refresh", refreshHandler)

// Everything below requires an authenticated session.
authRouter.use(requireAuth)
authRouter.get("/me", meHandler)
authRouter.post("/logout", logoutHandler)