import { describe, expect, it } from "vitest"
import { ApiError } from "../src/lib/ApiError.js"
import {
  ENROLLMENT_PERIOD_OVERLAP_CONSTRAINT,
  enrollmentPeriodOverlapError,
  isEnrollmentPeriodOverlapError,
} from "../src/modules/enrollment-history/enrollment-history.errors.js"

describe("enrollment period overlap error mapping (database-free)", () => {
  it("recognizes a Prisma P2004 carrying the exclusion-constraint name", () => {
    const error = {
      code: "P2004",
      message: "A constraint failed on the database",
      meta: {
        database_error: `conflicting key value violates exclusion constraint "${ENROLLMENT_PERIOD_OVERLAP_CONSTRAINT}"`,
      },
    }
    expect(isEnrollmentPeriodOverlapError(error)).toBe(true)
  })

  it("recognizes SQLSTATE 23P01 even without the constraint name", () => {
    expect(
      isEnrollmentPeriodOverlapError(new Error("error: 23P01: exclusion constraint violated")),
    ).toBe(true)
  })

  it("does not match other database errors", () => {
    expect(
      isEnrollmentPeriodOverlapError({
        code: "P2004",
        message: "A constraint failed on the database",
        meta: { database_error: 'violates check constraint "calendar_day_instructional_value_check"' },
      }),
    ).toBe(false)
    expect(isEnrollmentPeriodOverlapError({ code: "P2002", meta: { target: ["admissionNumber"] } })).toBe(false)
    expect(isEnrollmentPeriodOverlapError({ code: "P2003", meta: { field_name: "studentId" } })).toBe(false)
    expect(isEnrollmentPeriodOverlapError(new Error("error: 23514: check constraint violated"))).toBe(false)
    expect(isEnrollmentPeriodOverlapError(null)).toBe(false)
    expect(isEnrollmentPeriodOverlapError("nope")).toBe(false)
  })

  it("maps to the existing safe 400 domain error", () => {
    const error = enrollmentPeriodOverlapError()
    expect(error).toBeInstanceOf(ApiError)
    expect(error.statusCode).toBe(400)
    expect(error.code).toBe("BAD_REQUEST")
    expect(error.message).toBe("The placement period overlaps an existing period for this student")
  })
})
