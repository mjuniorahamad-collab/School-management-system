import { badRequestError } from "../../lib/ApiError.js"

// Placement periods are half-open intervals [effectiveFrom, effectiveTo).
// A NULL effectiveTo is the open/current period (unbounded in the future).
// These pure helpers mirror the SQL EXCLUDE constraint so callers get a clean
// domain error before the database rejects a conflicting write.

function startMs(from: Date): number {
  return from.getTime()
}

function endMs(to: Date | null): number {
  return to ? to.getTime() : Number.POSITIVE_INFINITY
}

/** True when two half-open [from, to) intervals share any instant. */
export function rangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  return startMs(aFrom) < endMs(bTo) && startMs(bFrom) < endMs(aTo)
}

/** True when the half-open interval covers the date (from <= d < to). */
export function periodCovers(from: Date, to: Date | null, date: Date): boolean {
  return startMs(from) <= date.getTime() && date.getTime() < endMs(to)
}

/** A present effectiveTo must be strictly after effectiveFrom. */
export function assertPeriodRange(from: Date, to: Date | null): void {
  if (to && to.getTime() <= from.getTime()) {
    throw badRequestError("A placement period's end must be after its start")
  }
}
