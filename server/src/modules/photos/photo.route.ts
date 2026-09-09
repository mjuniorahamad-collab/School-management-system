import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { rateLimit } from "../../middleware/rateLimit.js"
import { uploadPhotoMiddleware } from "../../middleware/upload.js"
import type { PermissionCode } from "../../permissions/permissions.js"
import { env } from "../../config/env.js"
import {
  makeRemoveHandler,
  makeServeHandler,
  makeUploadHandler,
  photoUploadErrorHandler,
} from "./photo.controller.js"
import type { PhotoEntity } from "./photo.service.js"

export interface PhotoRouteOptions {
  /** Permission required to view (and thus serve) the photo. */
  view: PermissionCode
  /** Permission required to upload/replace/remove the photo. */
  update: PermissionCode
}

/**
 * Builds the photo sub-router for an entity. Mounted at `/api/v1/<entity>/:id/photo`.
 * The upload/replace route is rate limited per-client; all routes are guarded by
 * `requireAuth` plus the appropriate capability permission.
 */
export function photoRoutes(entity: PhotoEntity, options: PhotoRouteOptions): Router {
  // mergeParams lets the child router read the parent's `:id` (req.params.id).
  const router = Router({ mergeParams: true })
  router.use(requireAuth)

  router.delete(
    "/",
    requirePermission(options.update),
    makeRemoveHandler(entity),
  )

  router.get(
    "/",
    requirePermission(options.view),
    makeServeHandler(entity),
  )

  router.put(
    "/",
    requirePermission(options.update),
    rateLimit({
      limit: env.upload.rateLimit.max,
      windowMs: env.upload.rateLimit.windowMs,
    }),
    uploadPhotoMiddleware.single("photo"),
    makeUploadHandler(entity),
    photoUploadErrorHandler,
  )

  return router
}
