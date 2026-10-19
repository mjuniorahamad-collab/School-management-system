import { describe, expect, it } from "vitest"
import { ApiClientError } from "@/lib/apiClient"
import { reportCardErrorMessage } from "./reportCardErrors"

const GENERIC = "Something went wrong. Please try again."

describe("reportCardErrorMessage", () => {
  it("prefers the backend message for a known code", () => {
    const error = new ApiClientError(
      409,
      "An active draft report card already exists for this student (version 2)",
      "REPORT_CARD_DRAFT_EXISTS",
    )
    expect(reportCardErrorMessage(error)).toBe(
      "An active draft report card already exists for this student (version 2)",
    )
  })

  it("falls back to the mapped message when a known code has no message", () => {
    const error = new ApiClientError(409, "", "REPORT_CARD_INVALID_STATE")
    expect(reportCardErrorMessage(error)).toBe(
      "This action is not allowed in the report card's current state.",
    )
  })

  it("maps the archive mismatch reason from details.reason", () => {
    const error = new ApiClientError(
      409,
      "The uploaded archive is bound to a different report card version",
      "REPORT_CARD_ARCHIVE_MISMATCH",
      { reason: "VERSION" },
    )
    expect(reportCardErrorMessage(error)).toBe(
      "The uploaded PDF is bound to a different version of this report card.",
    )
  })

  it("maps every archive mismatch reason", () => {
    const cases = {
      REPORT_CARD: "The uploaded PDF belongs to a different report card.",
      VERSION: "The uploaded PDF is bound to a different version of this report card.",
      SNAPSHOT_HASH: "The uploaded PDF is bound to a different frozen snapshot of this report card.",
    } as const
    for (const [reason, expected] of Object.entries(cases)) {
      const error = new ApiClientError(409, "mismatch", "REPORT_CARD_ARCHIVE_MISMATCH", { reason })
      expect(reportCardErrorMessage(error)).toBe(expected)
    }
  })

  it("falls back to the backend message for an unrecognized mismatch reason", () => {
    const error = new ApiClientError(409, "Backend mismatch detail", "REPORT_CARD_ARCHIVE_MISMATCH", {
      reason: "NOPE",
    })
    expect(reportCardErrorMessage(error)).toBe("Backend mismatch detail")
  })

  it("returns the backend message for an unknown code", () => {
    const error = new ApiClientError(400, "Bad request", "SOMETHING_ELSE")
    expect(reportCardErrorMessage(error)).toBe("Bad request")
  })

  it("returns a generic fallback when a code is unmapped and has no message", () => {
    const error = new ApiClientError(400, "", "UNMAPPED")
    expect(reportCardErrorMessage(error)).toBe(GENERIC)
  })

  it("handles a plain Error", () => {
    expect(reportCardErrorMessage(new Error("boom"))).toBe("boom")
  })

  it("handles an empty plain Error and non-error values", () => {
    expect(reportCardErrorMessage(new Error(""))).toBe(GENERIC)
    expect(reportCardErrorMessage("nope")).toBe(GENERIC)
    expect(reportCardErrorMessage(null)).toBe(GENERIC)
    expect(reportCardErrorMessage(undefined)).toBe(GENERIC)
  })
})
