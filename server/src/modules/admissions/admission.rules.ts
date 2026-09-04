import type { AdmissionApplication } from "@prisma/client"
import { badRequestError } from "../../lib/ApiError.js"

/**
 * Validates that a review status transition is allowed for the current state.
 * A pending application may be approved, rejected or withdrawn; an application
 * that has already been reviewed (or converted) is terminal and cannot change.
 */
export function assertReviewable(application: AdmissionApplication): void {
  if (application.status !== "PENDING") {
    throw badRequestError(
      `This application cannot be reviewed because it is already ${application.status}`,
    )
  }
}

/**
 * Validates that an application can be converted to a Student: it must be
 * APPROVED and not already converted.
 */
export function assertConvertible(application: AdmissionApplication): void {
  if (application.status !== "APPROVED") {
    throw badRequestError(
      `Only an approved application can be converted to a student (current status: ${application.status})`,
    )
  }
  if (application.convertedAt || application.convertedStudentId) {
    throw badRequestError("This application has already been converted to a student")
  }
}
