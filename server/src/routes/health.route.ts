import { Router } from "express"
import { healthHandler } from "../controllers/health.controller.js"

export const healthRouter: Router = Router()

healthRouter.get("/health", healthHandler)