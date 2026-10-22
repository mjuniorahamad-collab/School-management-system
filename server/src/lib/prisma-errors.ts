import { Prisma } from "@prisma/client"
import { ApiError, dependencyConflictError, notFoundError } from "./ApiError.js"

/**
 * Central mapping of Prisma's known-request errors onto the API error envelope.
 *
 * Without this, a foreign-key conflict (P2003) or a missing-row update/delete
 * (P2025) escapes every service-level catch and reaches the error handler as an
 * unknown error — surfacing as a generic 500 instead of the accurate 409/404.
 *
 * The mapping is intentionally conservative:
 *   - only Prisma's own known-request errors are translated;
 *   - the response message never contains the constraint name, table, column or
 *     SQL — only a stable, human-readable sentence;
 *   - anything else returns `null` so the caller keeps its existing behaviour
 *     (log + generic 500).
 */

/**
 * Reads the Prisma error code from an unknown thrown value.
 *
 * `instanceof` is the primary check, but the structural fallback keeps the
 * mapping working when the error crossed a module boundary that carries a
 * different copy of the Prisma runtime (a classic dual-package hazard).
 */
export function prismaErrorCode(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code
  if (typeof error !== "object" || error === null) return null
  const candidate = error as { name?: unknown; code?: unknown }
  if (candidate.name !== "PrismaClientKnownRequestError") return null
  return typeof candidate.code === "string" ? candidate.code : null
}

/**
 * Translates a Prisma known-request error into an `ApiError`, or returns `null`
 * when the error is not one this application maps.
 */
export function toPrismaApiError(error: unknown): ApiError | null {
  const code = prismaErrorCode(error)
  if (code === null) return null

  switch (code) {
    // A foreign-key constraint failed: the row is still referenced by other
    // rows, or it points at a row that no longer exists. It is a conflict the
    // caller can resolve, not a server fault.
    case "P2003":
      return dependencyConflictError()
    // The record the operation targeted does not exist.
    case "P2025":
      return notFoundError()
    default:
      return null
  }
}
