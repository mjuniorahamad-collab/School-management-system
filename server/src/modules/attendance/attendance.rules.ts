export function computeAttendancePercent(present: number, total: number): number {
  if (total === 0) return 0
  return Math.round((present / total) * 10000) / 100
}
