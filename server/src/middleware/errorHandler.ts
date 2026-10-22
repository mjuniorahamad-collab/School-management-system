import type { ErrorRequestHandler } from "express"
import { ApiError } from "../lib/ApiError.js"
import { toPrismaApiError } from "../lib/prisma-errors.js"
import { logError } from "../lib/logger.js"
import { fail, failWithDetails } from "../lib/response.js"

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }

  if (error instanceof ApiError) {
    const body =
      error.details === undefined
        ? fail(error.code, error.message)
        : failWithDetails(error.code, error.message, error.details)
    res.status(error.statusCode).json(body)
    return
  }

  // Prisma's own known-request errors carry an accurate client-facing meaning
  // that no service-level catch may cover: a foreign-key dependency conflict
  // (409) and a missing target row (404). They are never leaked as 500s and
  // never carry raw SQL, constraint names or other internals.
  const prismaError = toPrismaApiError(error)
  if (prismaError) {
    res.status(prismaError.statusCode).json(fail(prismaError.code, prismaError.message))
    return
  }

  if (error instanceof SyntaxError && (error as { status?: number }).status === 400) {
    res.status(400).json(fail("BAD_REQUEST", "Malformed JSON in request body"))
    return
  }

  logError(error)
  res.status(500).json(fail("INTERNAL_ERROR", "An unexpected error occurred"))
}
