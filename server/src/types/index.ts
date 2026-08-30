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