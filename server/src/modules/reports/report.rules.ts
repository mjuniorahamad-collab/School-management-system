/**
 * Pure report calculations. Dependency-free (no Prisma, no I/O) so they can be
 * unit-tested without a database, mirroring `fee-invoice.rules.ts`.
 *
 * Attendance summary semantics match the dashboard exactly:
 *   - `presentRate` = (PRESENT + LATE) / (PRESENT + LATE + ABSENT) — a HOLIDAY
 *     record is not part of the attended-vs-absent denominator.
 */

export interface AttendanceBucket {
  present: number
  late: number
  absent: number
  holiday: number
  total: number
  presentRate: number
}

/** Rounds a ratio to one decimal place (percent). */
export function ratioPercent(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

export function summarizeAttendanceCounts(counts: Readonly<Record<string, number>>): AttendanceBucket {
  const present = counts.PRESENT ?? 0
  const late = counts.LATE ?? 0
  const absent = counts.ABSENT ?? 0
  const holiday = counts.HOLIDAY ?? 0
  const attended = present + late
  const scoped = attended + absent
  return {
    present,
    late,
    absent,
    holiday,
    total: present + late + absent + holiday,
    presentRate: ratioPercent(attended, scoped),
  }
}

/** Groups a UTC date into a "YYYY-MM" bucket used by the admissions report. */
export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}