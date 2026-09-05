import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  generateInvoicesHandler,
  getGenerationPreviewHandler,
  getInvoiceHandler,
  listInvoicesHandler,
} from "./fee-invoice.controller.js"

// Fee invoices materialize a class's FeeStructure for every ACTIVE enrolled
// student of an academic session. Generation is idempotent: a student may only
// have one invoice per session (DB-enforced), so re-running the endpoint only
// ever marks the run for the remaining students.
//
// NOTE on `status`: the API always returns the *derived* status (recomputed from
// installment balances + due dates on read). The stored `status` column is
// maintained at generation time and on every payment write, and is what the
// `?status=` list filter queries. An invoice that becomes overdue purely by the
// passage of time will show OVERDUE in responses immediately; the stored column
// lags until the next write.
export const feeInvoicesRouter: Router = Router()

feeInvoicesRouter.use(requireAuth)

feeInvoicesRouter.get("/", requirePermission("fees:view"), listInvoicesHandler)
feeInvoicesRouter.get("/generation-preview", requirePermission("fees:view"), getGenerationPreviewHandler)
feeInvoicesRouter.post("/generate", requirePermission("fees:create"), generateInvoicesHandler)
feeInvoicesRouter.get("/:id", requirePermission("fees:view"), getInvoiceHandler)