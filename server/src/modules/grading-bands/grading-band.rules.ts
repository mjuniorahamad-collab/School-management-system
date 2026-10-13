import { badRequestError } from "../../lib/ApiError.js"

/**
 * Pure grading-band range rule, kept free of Prisma and I/O so it can be
 * unit-tested without a database.
 *
 * Band bounds are inclusive integer percentages; a band is only meaningful when
 * its minimum is not greater than its maximum. This mirrors the
 * `createGradingBandSchema` refine, but is callable against the MERGED incoming
 * and persisted bounds so a partial update cannot leave an inverted range
 * behind. It throws the application's `badRequestError` so invalid input maps to
 * the standard 400 envelope rather than an unhandled 500.
 */
export function assertBandRange(minPercent: number, maxPercent: number): void {
  if (minPercent > maxPercent) {
    throw badRequestError("Maximum percentage must be greater than or equal to the minimum")
  }
}
