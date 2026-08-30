export const NOT_FOUND = "NOT_FOUND"
export const BAD_REQUEST = "BAD_REQUEST"
export const VALIDATION_ERROR = "VALIDATION_ERROR"
export const INTERNAL_ERROR = "INTERNAL_ERROR"
export const UNAUTHORIZED = "UNAUTHORIZED"
export const FORBIDDEN = "FORBIDDEN"
export const INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
export const ACCOUNT_DISABLED = "ACCOUNT_DISABLED"

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