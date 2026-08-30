export const NOT_FOUND = "NOT_FOUND"
export const BAD_REQUEST = "BAD_REQUEST"
export const VALIDATION_ERROR = "VALIDATION_ERROR"
export const INTERNAL_ERROR = "INTERNAL_ERROR"

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