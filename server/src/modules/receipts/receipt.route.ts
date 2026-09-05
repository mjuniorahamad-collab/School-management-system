import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { getReceiptByIdHandler, listReceiptsHandler } from "./receipt.controller.js"

export const receiptsRouter: Router = Router()

receiptsRouter.use(requireAuth)

receiptsRouter.get("/", requirePermission("receipts:view"), listReceiptsHandler)
receiptsRouter.get("/:id", requirePermission("receipts:view"), getReceiptByIdHandler)