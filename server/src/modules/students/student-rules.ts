import { badRequestError } from "../../lib/ApiError.js"
import type { GuardianInput } from "./student.schema.js"

/**
 * Normalizes the primary-guardian flag on an incoming guardian list:
 * - more than one primary is a hard error,
 * - when none is marked, the first guardian becomes primary,
 * - every non-primary guardian is explicitly flagged false.
 */
export function normalizeGuardianPrimaries(guardians: GuardianInput[]): GuardianInput[] {
  if (guardians.length === 0) return guardians
  const primaries = guardians.filter((guardian) => guardian.isPrimary)
  if (primaries.length > 1) {
    throw badRequestError("Only one guardian can be marked as primary")
  }
  if (primaries.length === 1) {
    return guardians.map((guardian) =>
      guardian.isPrimary ? guardian : { ...guardian, isPrimary: false },
    )
  }
  return guardians.map((guardian, index) => ({
    ...guardian,
    isPrimary: index === 0,
  }))
}