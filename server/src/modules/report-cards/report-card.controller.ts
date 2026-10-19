import type { ErrorRequestHandler, RequestHandler } from "express"
import { env } from "../../config/env.js"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  attachReportCardArchive,
  getReportCardArchive,
  PDF_ARCHIVE_CONTENT_TYPE,
} from "./report-card.artifact.service.js"
import * as reportCardService from "./report-card.service.js"
import {
  generateReportCardSchema,
  listReportCardsSchema,
} from "./report-card.api.schema.js"

function requireAuth(req: { auth?: AuthUser }): {
  schoolId: string
  userId: string
  name: string
  email: string
  roles: string[]
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return {
    schoolId: req.auth.school.id,
    userId: req.auth.id,
    name: req.auth.name,
    email: req.auth.email,
    roles: req.auth.roles,
  }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listReportCardsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listReportCardsSchema, req.query, "Invalid report cards query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await reportCardService.listReportCards(query, schoolId)))
}

export const getReportCardHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await reportCardService.getReportCard(routeParam(req.params.id), schoolId)))
}

export const generateReportCardHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(
    generateReportCardSchema,
    req.body,
    "Invalid report card generation data",
  )
  const actor = requireAuth(req)
  const created = await reportCardService.generateReportCard(input, actor)
  res.status(201).json(ok(created))
}

export const publishReportCardHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  const published = await reportCardService.publishReportCard(routeParam(req.params.id), actor)
  res.json(ok(published))
}

export const issueReportCardHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  const issued = await reportCardService.issueReportCard(routeParam(req.params.id), actor)
  res.json(ok(issued))
}

interface UploadedFile {
  buffer: Buffer
  originalname?: string
}

/**
 * Single-file archive upload (multipart, field "pdf", in-memory parsing). The
 * size limit is enforced by the parser while the body streams; the service
 * validates magic bytes, checksum and version binding from the stored bytes.
 */
export const attachReportCardArchiveHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  const file = (req as { file?: UploadedFile }).file
  if (!file) throw badRequestError('Provide the PDF as the multipart field "pdf"')

  const artifact = await attachReportCardArchive({
    reportCardId: routeParam(req.params.id),
    actor: { schoolId: actor.schoolId, userId: actor.userId },
    file: { buffer: file.buffer },
    filename: file.originalname ?? null,
    maxBytes: env.upload.pdfMaxSizeBytes,
  })
  res.status(201).json(ok(artifact))
}

/**
 * Authenticated archive serving. The storage key always comes from the
 * artifact row (tenant + card scoped) — the URL alone can never address an
 * arbitrary object. Content type is set explicitly to `application/pdf` because
 * storage providers report the generic binary type for this extension.
 */
export const serveReportCardArchiveHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  const archive = await getReportCardArchive(routeParam(req.params.id), schoolId)
  if (!archive) throw notFoundError("Report card archive not found")
  res.setHeader("Content-Type", PDF_ARCHIVE_CONTENT_TYPE)
  res.setHeader("Cache-Control", "private, no-store")
  res.send(archive.buffer)
}

/**
 * Translates multer payload errors (size limits, unexpected fields) to the
 * standard API error envelope. Mounted after the multipart middleware.
 */
export const reportCardUploadErrorHandler: ErrorRequestHandler = (error, _req, _res, next) => {
  if (error instanceof Error && error.name === "MulterError") {
    const code = (error as { code?: string }).code
    if (code === "LIMIT_FILE_SIZE") {
      const maxMb = Math.round(env.upload.pdfMaxSizeBytes / (1024 * 1024))
      next(badRequestError(`PDF archive exceeds the maximum allowed size of ${maxMb} MB`))
      return
    }
    if (code === "LIMIT_UNEXPECTED_FILE") {
      next(badRequestError('Expected exactly one PDF file as the multipart field "pdf"'))
      return
    }
    next(badRequestError(`Invalid upload: ${error.message}`))
    return
  }
  next(error)
}
