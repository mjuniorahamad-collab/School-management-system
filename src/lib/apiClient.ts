import type { ApiErrorBody } from "@/types/api"

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "/api/v1"

const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Normalized API failure. `status` is 0 for network/timeout failures.
 * `code` mirrors the backend error code when one was returned; `details`
 * mirrors the backend `error.details` (e.g. zod `issues`) when available.
 */
export class ApiClientError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
    this.code = code
    this.details = details
  }
}

interface RequestOptions {
  timeoutMs?: number
}

async function request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  const controller = new AbortController()
  const externalSignal = init?.signal
  const abortFromExternal = () => controller.abort()
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true })
  if (externalSignal?.aborted) controller.abort()

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let didTimeout = false
  const timer = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  try {
    const headers = new Headers(init?.headers)
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: "include",
    })

    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text) as unknown
      } catch {
        body = null
      }
    }

    if (!response.ok) {
      const errorBody = body as ApiErrorBody | null
      throw new ApiClientError(
        response.status,
        errorBody?.error?.message ?? `Request failed with status ${response.status}`,
        errorBody?.error?.code,
        errorBody?.error?.details,
      )
    }

    const envelope = body as { success?: boolean; data?: T } | null
    return (envelope?.data ?? body) as T
  } catch (error) {
    if (didTimeout) throw new ApiClientError(0, "Request timed out", "TIMEOUT")
    if (error instanceof ApiClientError) throw error
    if (externalSignal?.aborted) throw error
    throw new ApiClientError(
      0,
      error instanceof Error ? error.message : "Network request failed",
      "NETWORK_ERROR",
    )
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener("abort", abortFromExternal)
  }
}

export const api = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, undefined, options)
  },
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { method: "POST", body: JSON.stringify(body) }, options)
  },
  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { method: "PUT", body: JSON.stringify(body) }, options)
  },
  patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, options)
  },
  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(
      path,
      { method: "DELETE", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
      options,
    )
  },
}