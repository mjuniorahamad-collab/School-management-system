import { describe, expect, it } from "vitest"
import type { AdmissionApplication } from "@prisma/client"
import { assertConvertible, assertReviewable } from "../src/modules/admissions/admission.rules.js"
import { createAdmissionSchema, reviewAdmissionSchema } from "../src/modules/admissions/admission.schema.js"
import { ApiError } from "../src/lib/ApiError.js"

// Database-free unit tests for the Admissions module: state-transition rules
// and request validation. Integration behavior lives in admissions.integration.test.ts.

function makeApplication(overrides: Partial<AdmissionApplication> = {}): AdmissionApplication {
  return {
    id: "application-1",
    schoolId: "school-1",
    applicationNumber: "APP-2026-0001",
    firstName: "Aarav",
    middleName: null,
    lastName: null,
    dateOfBirth: new Date("2016-06-01T00:00:00.000Z"),
    gender: "MALE",
    email: null,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    status: "PENDING",
    preferredAcademicSessionId: null,
    preferredClassId: null,
    preferredSectionId: null,
    guardianName: "Ravi Kumar",
    guardianPhone: "9812345678",
    guardianEmail: null,
    guardianRelationshipType: "PARENT",
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    convertedStudentId: null,
    convertedBy: null,
    convertedAt: null,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  }
}

function errorMessageOf(fn: () => void): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof ApiError) return error.message
    throw error
  }
  throw new Error("Expected an ApiError to be thrown")
}

describe("assertReviewable", () => {
  it("allows reviewing a pending application", () => {
    expect(() => assertReviewable(makeApplication())).not.toThrow()
  })

  it("rejects a reviewed application from further review", () => {
    expect(() => assertReviewable(makeApplication({ status: "APPROVED" }))).toThrow()
  })

  it("rejects a rejected application from review", () => {
    const message = errorMessageOf(() => assertReviewable(makeApplication({ status: "REJECTED" })))
    expect(message).toContain("already REJECTED")
  })
})

describe("assertConvertible", () => {
  it("allows converting an approved, not-yet-converted application", () => {
    expect(() => assertConvertible(makeApplication({ status: "APPROVED" }))).not.toThrow()
  })

  it("rejects converting a pending application", () => {
    expect(() => assertConvertible(makeApplication({ status: "PENDING" }))).toThrow()
  })

  it("rejects converting a rejected application", () => {
    const message = errorMessageOf(() => assertConvertible(makeApplication({ status: "REJECTED" })))
    expect(message).toContain("approved application")
  })

  it("rejects converting an application that was already converted", () => {
    expect(() =>
      assertConvertible(
        makeApplication({ status: "APPROVED", convertedStudentId: "student-9", convertedAt: new Date() }),
      ),
    ).toThrow("already been converted")
  })
})

describe("createAdmissionSchema", () => {
  it("accepts a valid payload with only guardian phone", () => {
    const result = createAdmissionSchema.safeParse({
      firstName: "Aarav",
      dateOfBirth: "2016-06-01",
      gender: "MALE",
      guardianName: "Ravi Kumar",
      guardianPhone: "9812345678",
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid payload with only guardian email", () => {
    const result = createAdmissionSchema.safeParse({
      firstName: "Aarav",
      dateOfBirth: "2016-06-01",
      gender: "FEMALE",
      guardianName: "Sunita Kumar",
      guardianEmail: "sunita@example.com",
    })
    expect(result.success).toBe(true)
  })

  it("requires at least one guardian contact", () => {
    const result = createAdmissionSchema.safeParse({
      firstName: "Aarav",
      dateOfBirth: "2016-06-01",
      gender: "MALE",
      guardianName: "Ravi Kumar",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("guardianContact"))).toBe(true)
    }
  })

  it("requires firstName, dateOfBirth and guardianName", () => {
    const result = createAdmissionSchema.safeParse({ gender: "MALE", guardianPhone: "123" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("firstName")
      expect(paths).toContain("dateOfBirth")
      expect(paths).toContain("guardianName")
    }
  })

  it("rejects an invalid date format", () => {
    const result = createAdmissionSchema.safeParse({
      firstName: "Aarav",
      dateOfBirth: "01/06/2016",
      gender: "MALE",
      guardianName: "Ravi Kumar",
      guardianPhone: "9812345678",
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown (strict) fields", () => {
    const result = createAdmissionSchema.safeParse({
      firstName: "Aarav",
      dateOfBirth: "2016-06-01",
      gender: "MALE",
      guardianName: "Ravi Kumar",
      guardianPhone: "9812345678",
      hackerField: true,
    })
    expect(result.success).toBe(false)
  })

  it("coerces an empty surname and contact to absent values", () => {
    const result = createAdmissionSchema.safeParse({
      firstName: "Aarav",
      lastName: "",
      dateOfBirth: "2016-06-01",
      gender: "MALE",
      guardianName: "Ravi Kumar",
      guardianPhone: "9812345678",
      guardianEmail: "",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lastName).toBeUndefined()
      expect(result.data.guardianEmail).toBeUndefined()
    }
  })
})

describe("reviewAdmissionSchema", () => {
  it("accepts an APPROVED review with an optional note", () => {
    expect(reviewAdmissionSchema.safeParse({ status: "APPROVED", note: "Docs verified" }).success).toBe(true)
  })

  it("rejects an invalid status", () => {
    const result = reviewAdmissionSchema.safeParse({ status: "CONVERTED" })
    expect(result.success).toBe(false)
  })
})
