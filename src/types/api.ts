// Mirrors the backend envelope contract (server/src/types/index.ts).
// Keep the two files in sync whenever the API contract changes.

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiErrorEnvelope {
  code: string
  message: string
  details?: unknown
}

export interface ApiErrorBody {
  success: false
  error: ApiErrorEnvelope
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiErrorBody