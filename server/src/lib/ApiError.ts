export const NOT_FOUND = "NOT_FOUND"
export const BAD_REQUEST = "BAD_REQUEST"
export const VALIDATION_ERROR = "VALIDATION_ERROR"
export const INTERNAL_ERROR = "INTERNAL_ERROR"
export const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
export const UNAUTHORIZED = "UNAUTHORIZED"
export const FORBIDDEN = "FORBIDDEN"
export const INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
export const ACCOUNT_DISABLED = "ACCOUNT_DISABLED"
export const STORAGE_ERROR = "STORAGE_ERROR"
export const ATTENDANCE_EXISTS = "ATTENDANCE_EXISTS"
export const ATTENDANCE_REGISTER_LOCKED = "ATTENDANCE_REGISTER_LOCKED"
export const REPORT_CARD_DRAFT_EXISTS = "REPORT_CARD_DRAFT_EXISTS"
export const REPORT_CARD_INVALID_STATE = "REPORT_CARD_INVALID_STATE"
export const REPORT_CARD_NOT_PUBLISHABLE = "REPORT_CARD_NOT_PUBLISHABLE"
export const REPORT_CARD_REISSUE_REASON_REQUIRED = "REPORT_CARD_REISSUE_REASON_REQUIRED"
export const REPORT_CARD_ARCHIVE_REQUIRED = "REPORT_CARD_ARCHIVE_REQUIRED"
export const REPORT_CARD_ARCHIVE_MISMATCH = "REPORT_CARD_ARCHIVE_MISMATCH"
export const REPORT_CARD_ARCHIVE_EXISTS = "REPORT_CARD_ARCHIVE_EXISTS"
export const REPORT_CARD_INVALID_PDF = "REPORT_CARD_INVALID_PDF"
export const REPORT_CARD_SIGNATORIES_REQUIRED = "REPORT_CARD_SIGNATORIES_REQUIRED"
export const REPORT_CARD_SIGNATORIES_INVALID = "REPORT_CARD_SIGNATORIES_INVALID"

/**
 * Error thrown by services/controllers for expected, client-relevant failures.
 * The central error handler maps it to the API error envelope.
 */
export class ApiError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function notFoundError(message = "Requested resource not found"): ApiError {
  return new ApiError(404, NOT_FOUND, message)
}

export function badRequestError(message: string, details?: unknown): ApiError {
  return new ApiError(400, BAD_REQUEST, message, details)
}

export function validationError(message = "Request validation failed", details?: unknown): ApiError {
  return new ApiError(400, VALIDATION_ERROR, message, details)
}

export function serviceUnavailableError(message = "Service is not ready"): ApiError {
  return new ApiError(503, SERVICE_UNAVAILABLE, message)
}

export function unauthorizedError(message = "Authentication required"): ApiError {
  return new ApiError(401, UNAUTHORIZED, message)
}

export function forbiddenError(message = "You do not have permission to perform this action"): ApiError {
  return new ApiError(403, FORBIDDEN, message)
}

export function invalidCredentialsError(message = "Invalid email or password"): ApiError {
  return new ApiError(401, INVALID_CREDENTIALS, message)
}

export function accountDisabledError(message = "This account is disabled or suspended"): ApiError {
  return new ApiError(403, ACCOUNT_DISABLED, message)
}

/**
 * Object-storage failure (storage provider). The message is intentionally
 * secret-free — full technical detail is logged server-side only.
 */
export function storageError(message = "Object storage is unavailable"): ApiError {
  return new ApiError(502, STORAGE_ERROR, message)
}

/**
 * A conflicting attendance record already exists for the student/date. Rejecting
 * instead of silently overwriting preserves the audit trail of who marked what.
 */
export function attendanceExistsError(
  message = "Attendance already marked for this student on this date",
): ApiError {
  return new ApiError(409, ATTENDANCE_EXISTS, message)
}

/**
 * A SUBMITTED or VERIFIED register is immutable: its records may only change
 * after the register is reopened by the audited calendar/placement correction
 * workflow (docs/academic-calendar.md §8). Rejecting the write keeps a verified
 * register consistent with the reported attendance.
 */
export function attendanceRegisterLockedError(
  message = "This attendance register is submitted or verified; reopen it to make changes",
): ApiError {
  return new ApiError(409, ATTENDANCE_REGISTER_LOCKED, message)
}