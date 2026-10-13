import { describe, expect, it } from "vitest"
import { computeAttendancePercent } from "../src/modules/attendance/attendance.rules.js"

// Independent calculation-verification suite for the pure attendance
// percentage. Complements attendance.unit.test.ts with zero-division, rounding
// boundaries, and out-of-range inputs.

describe("computeAttendancePercent (calculation)", () => {
  it("returns 0 when there are no tracked days", () => {
    // Source guard (attendance.rules.ts:2): if (total === 0) return 0.
    expect(computeAttendancePercent(0, 0)).toBe(0)
  })

  it("returns 0 for no attendance over tracked days", () => {
    expect(computeAttendancePercent(0, 10)).toBe(0)
  })

  it("returns 100 for full attendance", () => {
    expect(computeAttendancePercent(10, 10)).toBe(100)
  })

  it("computes a clean integer percentage", () => {
    expect(computeAttendancePercent(8, 10)).toBe(80)
  })

  it("rounds a repeating percentage to two places", () => {
    expect(computeAttendancePercent(1, 3)).toBe(33.33)
    expect(computeAttendancePercent(2, 3)).toBe(66.67)
  })

  it("rounds other denominators to two places", () => {
    expect(computeAttendancePercent(1, 6)).toBe(16.67)
    expect(computeAttendancePercent(1, 7)).toBe(14.29)
  })

  it("keeps one-decimal and two-decimal exactness", () => {
    expect(computeAttendancePercent(1, 16)).toBe(6.25)
    expect(computeAttendancePercent(999, 1000)).toBe(99.9)
  })

  it("rounds an exact half up at the third decimal (3.125 -> 3.13)", () => {
    expect(computeAttendancePercent(1, 32)).toBe(3.13)
  })

  it("rejects a present count above the total", () => {
    expect(() => computeAttendancePercent(12, 10)).toThrow(/cannot exceed total/)
  })

  it("rejects a positive present count with a zero total", () => {
    expect(() => computeAttendancePercent(1, 0)).toThrow(/cannot exceed total/)
  })

  it("rejects a negative present count", () => {
    expect(() => computeAttendancePercent(-1, 10)).toThrow(/non-negative/)
  })

  it("rejects a negative total", () => {
    expect(() => computeAttendancePercent(0, -1)).toThrow(/non-negative/)
  })

  it("rejects non-finite inputs", () => {
    expect(() => computeAttendancePercent(Number.NaN, 10)).toThrow(/finite/)
    expect(() => computeAttendancePercent(1, Number.POSITIVE_INFINITY)).toThrow(/finite/)
  })
})

describe("attendance percentage invariants (property)", () => {
  it("matches the rounding formula and stays within [0, 100] for valid input", () => {
    for (let total = 1; total <= 50; total += 1) {
      let previous = -1
      for (let present = 0; present <= total; present += 1) {
        const percent = computeAttendancePercent(present, total)
        expect(percent).toBe(Math.round((present / total) * 10000) / 100)
        expect(percent).toBeGreaterThanOrEqual(0)
        expect(percent).toBeLessThanOrEqual(100)
        expect(percent).toBeGreaterThanOrEqual(previous)
        previous = percent
      }
    }
  })
})
