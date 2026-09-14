import type { ApiErrorBody } from "@/types/api"

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "/api/v1"

const DEFAULT_TIMEOUT_MS = 10_000
// Multipart uploads (e.g. profile photos) can legitimately take longer than
// the default JSON budget, especially on cold/first requests after deploy.
const UPLOAD_TIMEOUT_MS = 30_000

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

// ── Session-refresh coordination ─────────────────────────────────────────────
// Access cookies are short-lived (15 min) with no proactive client refresh, so
// any request can hit 401 with a still-valid refresh cookie. On 401 we refresh
// the session once (single-flight across concurrent failures) and retry the
// original request. If the refresh token itself is rejected, the session is
// over: listeners are notified and the UI may clear auth state/redirect.
type SignedOutListener = () => void
const signedOutListeners = new Set<SignedOutListener>()

export function onSignedOut(listener: SignedOutListener): () => void {
  signedOutListeners.add(listener)
  return () => {
    signedOutListeners.delete(listener)
  }
}

function emitSignedOut(): void {
  for (const listener of [...signedOutListeners]) listener()
}

type RefreshOutcome = "ok" | "revoked" | "failed"
let refreshInFlight: Promise<RefreshOutcome> | null = null

async function refreshSessionCookie(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshOutcome> => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          credentials: "include",
        })
        // The server rotates both cookies via Set-Cookie on success. A 4xx
        // means the refresh token is invalid/revoked/expired -> session over.
        return response.ok ? "ok" : "revoked"
      } catch {
        // Network failure: keep the session and let the original error surface.
        return "failed"
      }
    })().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}
// ─────────────────────────────────────────────────────────────────────────────

const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/logout", "/auth/refresh"])

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

  const attempt = async (): Promise<T> => {
    const headers = new Headers(init?.headers)
    // If we have a FormData body the browser sets a multipart boundary header;
    // forcing JSON Content-Type would break the upload.
    const isMultipart = init?.body instanceof FormData
    if (!headers.has("Content-Type") && !isMultipart) {
      headers.set("Content-Type", "application/json")
    }

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
  }

  try {
    try {
      return await attempt()
    } catch (error) {
      const isExpiredSession = error instanceof ApiClientError && error.status === 401
      if (!isExpiredSession || NO_REFRESH_PATHS.has(path)) throw error

      const outcome = await refreshSessionCookie()
      if (outcome !== "ok") {
        if (outcome === "revoked") emitSignedOut()
        // Re-throw the original 401 so the caller sees the real failure.
        throw error
      }
      // Cookies rotated; retry the original request once.
      return await attempt()
    }
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
  /** Sends a multipart payload (e.g. a profile-photo upload). */
  putForm<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
    return request<T>(
      path,
      { method: "PUT", body: formData },
      { timeoutMs: UPLOAD_TIMEOUT_MS, ...options },
    )
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