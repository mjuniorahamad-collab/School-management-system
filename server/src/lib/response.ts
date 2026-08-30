import type { ApiErrorBody, ApiSuccess } from "../types/index.js"

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data }
}

export function fail(code: string, message: string): ApiErrorBody {
  return { success: false, error: { code, message } }
}

export function failWithDetails(code: string, message: string, details: unknown): ApiErrorBody {
  return { success: false, error: { code, message, details } }
}