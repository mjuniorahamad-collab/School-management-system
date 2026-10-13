export function computeAttendancePercent(present: number, total: number): number {
  if (!Number.isFinite(present) || !Number.isFinite(total)) {
    throw new RangeError("present and total must be finite numbers")
  }
  if (total < 0 || present < 0) {
    throw new RangeError("present and total must be non-negative")
  }
  if (present > total) {
    throw new RangeError("present cannot exceed total")
  }
  if (total === 0) return 0
  return Math.round((present / total) * 10000) / 100
}
