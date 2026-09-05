import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createPaymentHandler,
  getPaymentByIdHandler,
  listPaymentsHandler,
} from "./payment.controller.js"

export const paymentsRouter: Router = Router()

paymentsRouter.use(requireAuth)

paymentsRouter.get("/", requirePermission("payments:view"), listPaymentsHandler)
paymentsRouter.post("/", requirePermission("payments:create"), createPaymentHandler)
paymentsRouter.get("/:id", requirePermission("payments:view"), getPaymentByIdHandler)