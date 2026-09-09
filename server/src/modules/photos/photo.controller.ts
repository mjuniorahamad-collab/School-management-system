import type { ErrorRequestHandler, RequestHandler } from "express"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import {
  getPhoto,
  removePhoto,
  uploadOrReplacePhoto,
  type PhotoEntity,
} from "./photo.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

/** Single-file upload/replace (multipart, field "photo", in-memory parsing). */
export function makeUploadHandler(entity: PhotoEntity): RequestHandler {
  return async (req, res) => {
    const auth = requireAuth(req)
    const file = (req as { file?: { buffer: Buffer; size: number } }).file
    if (!file) {
      throw badRequestError('Provide a photo as the multipart field "photo"')
    }
    const result = await uploadOrReplacePhoto(entity, {
      id: routeParam(req.params.id),
      schoolId: auth.school.id,
      actor: auth,
      file,
    })
    res.json(ok(result))
  }
}

/** Removes the entity's photo. */
export function makeRemoveHandler(entity: PhotoEntity): RequestHandler {
  return async (req, res) => {
    const auth = requireAuth(req)
    const result = await removePhoto(entity, {
      id: routeParam(req.params.id),
      schoolId: auth.school.id,
      actor: auth,
    })
    res.json(ok(result))
  }
}

/**
 * Authenticated photo serving. The key is always resolved from the database
 * (tenant + entity scoped) — the URL alone can never be used to fetch an
 * arbitrary object, which keeps photos private.
 */
export function makeServeHandler(entity: PhotoEntity): RequestHandler {
  return async (req, res) => {
    const auth = requireAuth(req)
    const photo = await getPhoto(entity, {
      id: routeParam(req.params.id),
      schoolId: auth.school.id,
    })
    if (!photo) throw notFoundError("Photo not found")
    res.setHeader("Content-Type", photo.contentType)
    res.setHeader("Cache-Control", "private, max-age=3600")
    res.send(photo.buffer)
  }
}

/**
 * Translates multer payload errors (size limits, unexpected fields) to the
 * standard API error envelope. Mounted after the multipart middleware.
 */
export const photoUploadErrorHandler: ErrorRequestHandler = (error, _req, _res, next) => {
  if (error instanceof Error && error.name === "MulterError") {
    const code = (error as { code?: string }).code
    if (code === "LIMIT_FILE_SIZE") {
      next(badRequestError("Photo is too large. Maximum size is 5 MB."))
      return
    }
    if (code === "LIMIT_UNEXPECTED_FILE") {
      next(badRequestError("Expected exactly one photo file"))
      return
    }
    next(badRequestError(`Invalid upload: ${error.message}`))
    return
  }
  next(error)
}