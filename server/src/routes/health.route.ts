import { Router } from "express"
import {
  healthHandler,
  livenessHandler,
  readinessHandler,
} from "../controllers/health.controller.js"

export const healthRouter: Router = Router()

healthRouter.get("/health", healthHandler)
healthRouter.get("/live", livenessHandler)
healthRouter.get("/ready", readinessHandler)
