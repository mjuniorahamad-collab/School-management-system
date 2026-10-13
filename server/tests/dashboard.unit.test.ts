import { describe, expect, it } from "vitest"
import {
  computeClassRanking,
  dateOnlyMonthKey,
  feeMonthToDateRanges,
  monthBucketCount,
  recentMonthKeys,
  selectBestExamContext,
  trendPercent,
  type ExamContextRow,
} from "../src/modules/dashboard/dashboard.rules.js"

describe("trendPercent (database-free)", () => {
  it("returns 100 when there was no prior data but current exceeds zero", () => {
    expect(trendPercent(12, 0)).toBe(100)
  })

  it("returns 0 when there is no prior or current data", () => {
    expect(trendPercent(0, 0)).toBe(0)
  })

  it("computes positive growth rounded to 1dp", () => {
    expect(trendPercent(110, 100)).toBe(10)
    expect(trendPercent(100, 30)).toBe(233.3)
  })

  it("computes negative growth", () => {
    expect(trendPercent(80, 100)).toBe(-20)
  })

  it("handles equal values as zero growth", () => {
    expect(trendPercent(50, 50)).toBe(0)
  })
})

describe("selectBestExamContext (database-free)", () => {
  const row = (overrides: Partial<ExamContextRow>): ExamContextRow => ({
    examTypeId: "exam-type-1",
    academicSessionId: "session-1",
    sessionStart: new Date("2026-04-01T00:00:00.000Z"),
    sessionName: "2026-27",
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    endDate: new Date("2026-06-05T00:00:00.000Z"),
    ...overrides,
  })

  it("returns null with no exams", () => {
    expect(selectBestExamContext([])).toBeNull()
  })

  it("returns null when the largest context has only one class", () => {
    const rows = [row({})]
    expect(selectBestExamContext(rows)).toBeNull()
  })

  it("picks the context with the most participating classes", () => {
    const rows = [
      // Context A has 3 classes, context B has 2 — A must win.
      row({ examTypeId: "A" }),
      row({ examTypeId: "A", startDate: new Date("2026-06-02T00:00:00.000Z") }),
      row({ examTypeId: "A", startDate: new Date("2026-06-03T00:00:00.000Z") }),
      row({ examTypeId: "B", academicSessionId: "session-latest", sessionName: "2027-28" }),
      row({ examTypeId: "B", academicSessionId: "session-latest", sessionName: "2027-28" }),
    ]
    const context = selectBestExamContext(rows)
    expect(context).not.toBeNull()
    expect(context?.examTypeId).toBe("A")
  })

  it("prefers the newer academic session when counts are equal", () => {
    const rows = [
      row({ examTypeId: "Older" }),
      row({ examTypeId: "Older" }),
      row({
        examTypeId: "Newer",
        academicSessionId: "session-2",
        sessionStart: new Date("2027-04-01T00:00:00.000Z"),
        sessionName: "2027-28",
      }),
      row({
        examTypeId: "Newer",
        academicSessionId: "session-2",
        sessionStart: new Date("2027-04-01T00:00:00.000Z"),
        sessionName: "2027-28",
      }),
    ]
    const context = selectBestExamContext(rows)
    expect(context?.examTypeId).toBe("Newer")
    expect(context?.academicSessionId).toBe("session-2")
    expect(context?.sessionName).toBe("2027-28")
  })

  it("breaks equal-count, same-session ties deterministically by name", () => {
    const rows = [
      row({ examTypeId: "Zebra" }),
      row({ examTypeId: "Zebra" }),
      row({ examTypeId: "Alpha" }),
      row({ examTypeId: "Alpha" }),
    ]
    const context = selectBestExamContext(rows)
    expect(context?.examTypeId).toBe("Alpha")
  })

  it("reports the min exam window across the chosen context", () => {
    const rows = [
      row({ startDate: new Date("2026-06-01T00:00:00.000Z"), endDate: new Date("2026-06-03T00:00:00.000Z") }),
      row({ startDate: new Date("2026-06-02T00:00:00.000Z"), endDate: new Date("2026-06-10T00:00:00.000Z") }),
    ]
    const context = selectBestExamContext(rows)
    expect(context?.from.toISOString()).toBe("2026-06-01T00:00:00.000Z")
    expect(context?.to.toISOString()).toBe("2026-06-10T00:00:00.000Z")
  })
})

describe("computeClassRanking (database-free)", () => {
  it("returns an empty ranking with no rows", () => {
    expect(computeClassRanking([])).toEqual([])
  })

  it("groups per-class averages and ranks descending", () => {
    const ranked = computeClassRanking([
      { className: "9", percentage: 70 },
      { className: "9", percentage: 90 },
      { className: "8", percentage: 60 },
      { className: "8", percentage: 66 },
      { className: "7", percentage: 100 },
    ])
    expect(ranked).toEqual([
      { rank: 1, name: "7", performance: 100, students: 1 },
      { rank: 2, name: "9", performance: 80, students: 2 },
      { rank: 3, name: "8", performance: 63, students: 2 },
    ])
  })

  it("rounds class averages to 1 decimal", () => {
    const ranked = computeClassRanking([
      { className: "9", percentage: 90 },
      { className: "9", percentage: 83 },
    ])
    expect(ranked[0].performance).toBe(86.5)
  })

  it("breaks performance ties deterministically by class name", () => {
    const ranked = computeClassRanking([
      { className: "B", percentage: 80 },
      { className: "A", percentage: 80 },
    ])
    expect(ranked.map((r) => r.name)).toEqual(["A", "B"])
  })
})

describe("monthBucketCount (database-free)", () => {
  it("splits a 31-day month into five day-of-month blocks", () => {
    expect(monthBucketCount(2026, 9)).toBe(5) // October
    expect(monthBucketCount(2026, 0)).toBe(5) // January
  })

  it("splits an exactly-four-week February into four blocks", () => {
    expect(monthBucketCount(2027, 1)).toBe(4) // February 2027 has 28 days
  })

  it("splits leap and 30-day months into five blocks", () => {
    expect(monthBucketCount(2028, 1)).toBe(5) // February 2028 has 29 days
    expect(monthBucketCount(2026, 3)).toBe(5) // April has 30 days
  })
})

describe("feeMonthToDateRanges (database-free)", () => {
  it("builds UTC date-only current and equivalent prior windows", () => {
    // Local calendar date is 2026-10-13 regardless of host timezone.
    const { current, prior } = feeMonthToDateRanges(new Date(2026, 9, 13, 12))
    expect(current.from.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(current.to.toISOString()).toBe("2026-10-13T23:59:59.999Z")
    expect(prior.from.toISOString()).toBe("2026-09-01T00:00:00.000Z")
    expect(prior.to.toISOString()).toBe("2026-09-13T23:59:59.999Z")
  })

  it("clamps a 31st to the prior month's last day", () => {
    const { current, prior } = feeMonthToDateRanges(new Date(2026, 2, 31, 12)) // 31 Mar 2026
    expect(current.to.toISOString()).toBe("2026-03-31T23:59:59.999Z")
    expect(prior.from.toISOString()).toBe("2026-02-01T00:00:00.000Z")
    expect(prior.to.toISOString()).toBe("2026-02-28T23:59:59.999Z") // Feb 2026 has 28 days
  })

  it("clamps a leap-year prior February to Feb 29", () => {
    const { prior } = feeMonthToDateRanges(new Date(2028, 2, 31, 12)) // 31 Mar 2028
    expect(prior.to.toISOString()).toBe("2028-02-29T23:59:59.999Z")
  })

  it("rolls the prior window back across a January boundary", () => {
    const { current, prior } = feeMonthToDateRanges(new Date(2027, 0, 5, 12)) // 5 Jan 2027
    expect(current.from.toISOString()).toBe("2027-01-01T00:00:00.000Z")
    expect(prior.from.toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(prior.to.toISOString()).toBe("2026-12-05T23:59:59.999Z")
  })
})

describe("dateOnlyMonthKey (database-free)", () => {
  it("reads a first-of-month @db.Date by UTC components, not local", () => {
    // Prisma returns `@db.Date` at UTC midnight. On a negative-UTC-offset host
    // local getters would report the previous month; UTC components must not.
    const key = dateOnlyMonthKey(new Date("2026-12-01T00:00:00.000Z"))
    expect(key).toEqual({ label: "Dec", year: 2026 })
  })

  it("keeps January first-of-month in January", () => {
    expect(dateOnlyMonthKey(new Date("2027-01-01T00:00:00.000Z"))).toEqual({ label: "Jan", year: 2027 })
  })

  it("distinguishes the same month across different years", () => {
    const a = dateOnlyMonthKey(new Date("2026-12-31T00:00:00.000Z"))
    const b = dateOnlyMonthKey(new Date("2027-12-01T00:00:00.000Z"))
    expect(a).toEqual({ label: "Dec", year: 2026 })
    expect(b).toEqual({ label: "Dec", year: 2027 })
    expect(a).not.toEqual(b)
  })

  it("does not shift a late-UTC-instant date into the next month", () => {
    expect(dateOnlyMonthKey(new Date("2026-02-28T23:00:00.000Z"))).toEqual({ label: "Feb", year: 2026 })
  })
})

describe("recentMonthKeys (database-free)", () => {
  it("returns the last N months ending at the current month, oldest first", () => {
    const keys = recentMonthKeys(6, new Date(2026, 5, 15, 12))
    expect(keys).toEqual([
      { label: "Jan", year: 2026 },
      { label: "Feb", year: 2026 },
      { label: "Mar", year: 2026 },
      { label: "Apr", year: 2026 },
      { label: "May", year: 2026 },
      { label: "Jun", year: 2026 },
    ])
  })

  it("rolls the year back correctly across a January boundary", () => {
    const keys = recentMonthKeys(6, new Date(2027, 0, 15, 12))
    expect(keys).toEqual([
      { label: "Aug", year: 2026 },
      { label: "Sep", year: 2026 },
      { label: "Oct", year: 2026 },
      { label: "Nov", year: 2026 },
      { label: "Dec", year: 2026 },
      { label: "Jan", year: 2027 },
    ])
  })
})