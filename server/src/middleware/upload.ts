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
