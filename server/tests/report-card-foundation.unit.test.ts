import { describe, expect, it } from "vitest"
import { ApiError } from "../src/lib/ApiError.js"
import { ROLE_PERMISSIONS, type RoleName } from "../src/permissions/permissions.js"
import {
  assertInstructionalValue,
  deriveWeeklyAffectedDates,
  normalizeWorkingWeekdays,
} from "../src/modules/academic-calendar/academic-calendar.rules.js"
import {
  createCalendarDaySchema,
  updateCalendarDaySchema,
  upsertCalendarSchema,
} from "../src/modules/academic-calendar/academic-calendar.schema.js"
import {
  CLASS_SCOPE_KEY,
  assertRegisterAcceptsRecordMutation,
  assertRegisterTransition,
  deriveScopeKey,
} from "../src/modules/attendance/attendance-register.rules.js"
import { openRegisterSchema } from "../src/modules/attendance/attendance-register.schema.js"
import {
  assertPeriodRange,
  periodCovers,
  rangesOverlap,
} from "../src/modules/enrollment-history/enrollment-history.rules.js"
import { correctPeriodSchema } from "../src/modules/enrollment-history/enrollment-history.schema.js"

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`)

function expectBadRequest(fn: () => void): ApiError {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.statusCode).toBe(400)
    return apiError
  }
  throw new Error("Expected a 400 ApiError to be thrown")
}

describe("academic calendar rules (database-free)", () => {
  it("canonically orders and deduplicates working weekdays", () => {
    expect(normalizeWorkingWeekdays(["FRIDAY", "MONDAY", "MONDAY", "WEDNESDAY"])).toEqual([
      "MONDAY",
      "WEDNESDAY",
      "FRIDAY",
    ])
  })

  it("rejects unknown weekdays and an empty set", () => {
    expectBadRequest(() => normalizeWorkingWeekdays(["FUNDAY"]))
    expectBadRequest(() => normalizeWorkingWeekdays([]))
  })

  it("enforces the instructional-value domain per kind", () => {
    expect(() => assertInstructionalValue("NON_INSTRUCTIONAL", 0)).not.toThrow()
    expectBadRequest(() => assertInstructionalValue("NON_INSTRUCTIONAL", 1))

    expect(() => assertInstructionalValue("INSTRUCTIONAL", 0.5)).not.toThrow()
    expect(() => assertInstructionalValue("INSTRUCTIONAL", 1)).not.toThrow()
    expectBadRequest(() => assertInstructionalValue("INSTRUCTIONAL", 0))
    expectBadRequest(() => assertInstructionalValue("INSTRUCTIONAL", 0.25))
  })

  it("validates the upsert / day schemas", () => {
    expect(upsertCalendarSchema.safeParse({ workingWeekdays: ["MONDAY"] }).success).toBe(true)
    expect(upsertCalendarSchema.safeParse({ workingWeekdays: [] }).success).toBe(false)
    // strict: unknown keys are rejected
    expect(
      upsertCalendarSchema.safeParse({ workingWeekdays: ["MONDAY"], extra: 1 }).success,
    ).toBe(false)

    expect(
      createCalendarDaySchema.safeParse({
        academicSessionId: "11111111-1111-4111-8111-111111111111",
        date: "2026-04-01",
        kind: "NON_INSTRUCTIONAL",
        instructionalValue: 0,
      }).success,
    ).toBe(true)
    expect(
      createCalendarDaySchema.safeParse({
        academicSessionId: "11111111-1111-4111-8111-111111111111",
        date: "01-04-2026",
        kind: "NON_INSTRUCTIONAL",
        instructionalValue: 0,
      }).success,
    ).toBe(false)

    expect(updateCalendarDaySchema.safeParse({ label: null }).success).toBe(true)
  })

  describe("deriveWeeklyAffectedDates", () => {
    const range = { startDate: "2026-04-01", endDate: "2026-04-30" }

    it("returns nothing when the weekday set is unchanged", () => {
      expect(
        deriveWeeklyAffectedDates({
          ...range,
          previousWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
          nextWeekdays: ["FRIDAY", "THURSDAY", "WEDNESDAY", "TUESDAY", "MONDAY"],
          overriddenDates: [],
        }),
      ).toEqual([])
    })

    it("does not treat an absent calendar (empty previous set) as a working week", () => {
      // No authored calendar leaves every date UNKNOWN and never instructional
      // (docs §3/§4), so going from nothing to MON..THU must not fabricate a
      // Friday flip: only the Mon..Thu dates change instructional truth.
      const result = deriveWeeklyAffectedDates({
        ...range,
        previousWeekdays: [],
        nextWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
        overriddenDates: [],
      })
      for (const friday of ["2026-04-03", "2026-04-10", "2026-04-17", "2026-04-24"]) {
        expect(result).not.toContain(friday)
      }
      expect(result).toContain("2026-04-06") // Monday
      expect(result).toContain("2026-04-30") // Thursday
    })

    it("returns the dates a weekday addition flips to instructional", () => {
      expect(
        deriveWeeklyAffectedDates({
          ...range,
          previousWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
          nextWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
          overriddenDates: [],
        }),
      ).toEqual(["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"])
    })

    it("returns the dates a weekday removal flips to non-instructional", () => {
      expect(
        deriveWeeklyAffectedDates({
          ...range,
          previousWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
          nextWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
          overriddenDates: [],
        }),
      ).toEqual(["2026-04-03", "2026-04-10", "2026-04-17", "2026-04-24"])
    })

    it("lets an explicit override win over the weekly rule", () => {
      expect(
        deriveWeeklyAffectedDates({
          ...range,
          previousWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
          nextWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
          overriddenDates: ["2026-04-11", "2026-04-25"],
        }),
      ).toEqual(["2026-04-04", "2026-04-18"])
    })

    it("returns nothing when every flipped date is overridden", () => {
      expect(
        deriveWeeklyAffectedDates({
          ...range,
          previousWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
          nextWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
          overriddenDates: ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"],
        }),
      ).toEqual([])
    })
  })
})

describe("attendance register rules (database-free)", () => {
  it("derives the server-owned scope key", () => {
    expect(deriveScopeKey(null)).toBe(CLASS_SCOPE_KEY)
    expect(CLASS_SCOPE_KEY).toBe("__CLASS__")
    expect(deriveScopeKey("22222222-2222-4222-8222-222222222222")).toBe(
      "22222222-2222-4222-8222-222222222222",
    )
  })

  it("only allows forward lifecycle transitions", () => {
    expect(() => assertRegisterTransition("OPEN", "SUBMITTED")).not.toThrow()
    expect(() => assertRegisterTransition("SUBMITTED", "VERIFIED")).not.toThrow()
    // No skipping, no going back.
    expectBadRequest(() => assertRegisterTransition("OPEN", "VERIFIED"))
    expectBadRequest(() => assertRegisterTransition("SUBMITTED", "OPEN"))
    expectBadRequest(() => assertRegisterTransition("VERIFIED", "OPEN"))
    expectBadRequest(() => assertRegisterTransition("VERIFIED", "SUBMITTED"))
  })

  it("only accepts attendance-record mutations while the register is OPEN", () => {
    expect(() => assertRegisterAcceptsRecordMutation("OPEN")).not.toThrow()
    for (const status of ["SUBMITTED", "VERIFIED"] as const) {
      try {
        assertRegisterAcceptsRecordMutation(status)
        throw new Error("Expected a 409 ApiError to be thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).statusCode).toBe(409)
        expect((error as ApiError).code).toBe("ATTENDANCE_REGISTER_LOCKED")
      }
    }
  })

  it("accepts a class-level register with a null section and rejects a bad date", () => {
    expect(
      openRegisterSchema.safeParse({
        academicSessionId: "11111111-1111-4111-8111-111111111111",
        classId: "22222222-2222-4222-8222-222222222222",
        sectionId: null,
        date: "2026-04-01",
      }).success,
    ).toBe(true)
    expect(
      openRegisterSchema.safeParse({
        academicSessionId: "11111111-1111-4111-8111-111111111111",
        classId: "22222222-2222-4222-8222-222222222222",
        date: "2026/04/01",
      }).success,
    ).toBe(false)
  })
})

describe("enrollment period rules (database-free)", () => {
  it("treats periods as half-open [from, to) intervals", () => {
    const aFrom = day("2026-04-01")
    const aTo = day("2026-06-01")
    // b starts exactly when a ends: touching, not overlapping.
    expect(rangesOverlap(aFrom, aTo, day("2026-06-01"), day("2026-07-01"))).toBe(false)
    // b starts one day before a ends: overlaps.
    expect(rangesOverlap(aFrom, aTo, day("2026-05-31"), day("2026-07-01"))).toBe(true)
    // open-ended period overlaps anything starting after it.
    expect(rangesOverlap(aFrom, null, day("2030-01-01"), null)).toBe(true)
  })

  it("covers a date inclusively at the start and exclusively at the end", () => {
    const from = day("2026-04-01")
    const to = day("2026-06-01")
    expect(periodCovers(from, to, day("2026-04-01"))).toBe(true)
    expect(periodCovers(from, to, day("2026-05-31"))).toBe(true)
    expect(periodCovers(from, to, day("2026-06-01"))).toBe(false)
    expect(periodCovers(from, null, day("2040-01-01"))).toBe(true)
  })

  it("requires a present end to be strictly after the start", () => {
    expect(() => assertPeriodRange(day("2026-04-01"), day("2026-06-01"))).not.toThrow()
    expect(() => assertPeriodRange(day("2026-04-01"), null)).not.toThrow()
    expectBadRequest(() => assertPeriodRange(day("2026-06-01"), day("2026-06-01")))
    expectBadRequest(() => assertPeriodRange(day("2026-06-01"), day("2026-04-01")))
  })

  it("validates the correction schema, allowing a cleared end date", () => {
    expect(correctPeriodSchema.safeParse({ effectiveTo: null }).success).toBe(true)
    expect(correctPeriodSchema.safeParse({ effectiveFrom: "2026-04-01" }).success).toBe(true)
    expect(correctPeriodSchema.safeParse({ unknown: true }).success).toBe(false)
  })
})

describe("report-card permission grants (database-free)", () => {
  const NEW_CODES = ["calendar:manage", "enrollment:history:manage"] as const

  it("grants the new codes to SUPER_ADMIN, SCHOOL_ADMIN and PRINCIPAL only", () => {
    for (const code of NEW_CODES) {
      for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as RoleName[]) {
        expect(
          ROLE_PERMISSIONS[role].includes(code),
          `role "${role}" should grant "${code}"`,
        ).toBe(true)
      }
      for (const role of ["TEACHER", "ACCOUNTANT", "LIBRARIAN"] as RoleName[]) {
        const granted = ROLE_PERMISSIONS[role]?.includes(code) ?? false
        expect(granted, `role "${role}" should NOT grant "${code}"`).toBe(false)
      }
    }
  })
})
