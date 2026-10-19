import { Router } from "express"
import { env } from "../../config/env.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { rateLimit } from "../../middleware/rateLimit.js"
import { uploadPdfMiddleware } from "../../middleware/upload.js"
import {
  attachReportCardArchiveHandler,
  generateReportCardHandler,
  getReportCardHandler,
  issueReportCardHandler,
  listReportCardsHandler,
  publishReportCardHandler,
  reportCardUploadErrorHandler,
  serveReportCardArchiveHandler,
} from "./report-card.controller.js"

export const reportCardsRouter: Router = Router()

reportCardsRouter.use(requireAuth)

reportCardsRouter.get("/", requirePermission("report-cards:view"), listReportCardsHandler)
reportCardsRouter.post(
  "/generate",
  requirePermission("report-cards:generate"),
  generateReportCardHandler,
)
reportCardsRouter.get("/:id", requirePermission("report-cards:view"), getReportCardHandler)
reportCardsRouter.post(
  "/:id/publish",
  requirePermission("report-cards:publish"),
  publishReportCardHandler,
)
// Issuance reuses `report-cards:publish`: §12 defines no separate issue code,
// and issuing is the second half of the same publication act.
reportCardsRouter.post(
  "/:id/issue",
  requirePermission("report-cards:publish"),
  issueReportCardHandler,
)
// Upload + visual confirmation in one action (§9.3). Rate limited per client
// like every other multipart route; the parser enforces the PDF size limit
// while the body streams.
reportCardsRouter.post(
  "/:id/archive",
  requirePermission("report-cards:archive"),
  rateLimit({
    limit: env.upload.rateLimit.max,
    windowMs: env.upload.rateLimit.windowMs,
  }),
  uploadPdfMiddleware.single("pdf"),
  attachReportCardArchiveHandler,
  reportCardUploadErrorHandler,
)
reportCardsRouter.get(
  "/:id/archive",
  requirePermission("report-cards:view"),
  serveReportCardArchiveHandler,
)
