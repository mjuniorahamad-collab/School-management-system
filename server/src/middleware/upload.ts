import multer, { type Multer } from "multer"
import { env } from "../config/env.js"

/**
 * Multipart parser for profile-photo uploads.
 *
 * Uses in-memory storage so the raw bytes can be validated and re-encoded by
 * Sharp before persistence. The parser enforces ONLY the upload-size limit (and
 * single-file count) — the client-provided Content-Type/extension are never
 * trusted and real image validation happens in `lib/image.processImage`.
 *
 * Multer errors (file too large, unexpected field, etc.) are translated by the
 * photo controllers into the standard `ApiError` envelope.
 */
export const uploadPhotoMiddleware: Multer = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.upload.maxSizeBytes,
    files: 1,
    fields: 0,
  },
})

/**
 * Multipart parser for report-card PDF archive uploads (docs/report-card.md §9).
 *
 * The size bound is declared on the parser's `limits.fileSize`, so Multer
 * aborts the request as soon as the byte count crosses the limit WHILE the body
 * is still streaming in — the oversized file is never fully buffered and never
 * reaches the archive service. The service performs its own bound check purely
 * as defence in depth for callers that bypass this middleware.
 *
 * The client-provided Content-Type/filename are never trusted; PDF validity is
 * established from the magic bytes in `report-card.artifact.service.ts`.
 */
export const uploadPdfMiddleware: Multer = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.upload.pdfMaxSizeBytes,
    files: 1,
    fields: 0,
  },
})
