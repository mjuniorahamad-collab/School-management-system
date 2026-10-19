import { badRequestError, type ApiError } from "../../lib/ApiError.js"

// The single PostgreSQL exclusion constraint that guards placement history
// (see migration `20261015000000_academic_calendar_enrollment_foundation`).
export const ENROLLMENT_PERIOD_OVERLAP_CONSTRAINT = "student_enrollment_period_no_overlap"

// SQLSTATE 23P01 = exclusion_violation. It is the only exclusion constraint in
// the schema, so matching the SQLSTATE is specific to this constraint.
const EXCLUSION_VIOLATION_SQLSTATE = "23P01"

/**
 * Collects every string PostgreSQL/Prisma may have surfaced the raw error in.
 * Prisma maps an exclusion-constraint violation to `P2004` with the server text
 * in `meta.database_error`; on some engine builds it surfaces as an
 * unknown-request error whose `message` carries the same text. Both are read.
 */
function searchableDatabaseText(error: unknown): string {
  if (error === null || typeof error !== "object") return ""
  const parts: string[] = []
  const withMessage = error as { message?: unknown; meta?: unknown }
  if (typeof withMessage.message === "string") parts.push(withMessage.message)
  const meta = withMessage.meta
  if (meta !== null && typeof meta === "object") {
    const databaseError = (meta as { database_error?: unknown }).database_error
    if (typeof databaseError === "string") parts.push(databaseError)
    else if (databaseError !== undefined) parts.push(JSON.stringify(databaseError))
  }
  return parts.join("\n")
}

/**
 * True only for the placement overlap exclusion violation. Deliberately keyed on
 * the exact constraint name or SQLSTATE 23P01, so an unrelated `P2004` (a CHECK
 * constraint, an enum, a foreign key, a unique violation) is never translated
 * into an overlap error.
 */
export function isEnrollmentPeriodOverlapError(error: unknown): boolean {
  const text = searchableDatabaseText(error)
  if (text === "") return false
  return (
    text.includes(ENROLLMENT_PERIOD_OVERLAP_CONSTRAINT) ||
    text.includes(EXCLUSION_VIOLATION_SQLSTATE)
  )
}

/**
 * The safe domain response for a placement overlap, identical in status/code to
 * the service's pre-write overlap check so a caller cannot tell (by response)
 * whether the conflict was caught up front or by the database constraint.
 * The raw server error never reaches the client.
 */
export function enrollmentPeriodOverlapError(): ApiError {
  return badRequestError("The placement period overlaps an existing period for this student")
}
