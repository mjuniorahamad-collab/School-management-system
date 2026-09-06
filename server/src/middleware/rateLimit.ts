import type { RequestHandler } from "express"
import { ApiError } from "../lib/ApiError.js"

export const RATE_LIMITED = "RATE_LIMITED"

// In-memory sliding-window rate limiter used to harden public, credential-fed
// endpoints (login/refresh) against brute-force and per-request CPU abuse
// (scrypt hashing). The store is deliberately module-local: each process keeps
// its own window, which is acceptable for a single-instance deployment. Multi-
// instance deployments should back this with shared storage.
interface WindowEntry {
  count: number
  resetAt: number
}

const store = new Map<string, WindowEntry>()

function prune(now: number): void {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
}

export interface RateLimitOptions {
  /** Max requests allowed within the window per key. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
  /** Number in the error envelope, distinct from generic auth codes. */
  code?: string
  message?: string
  /** Key extractor; defaults to the remote IP. */
  key?: (req: { ip?: string }) => string
  /** Skip enforcement (used in test/dev only). */
  enabled?: boolean
}

/**
 * Returns a middleware that rejects requests exceeding `limit` within the
 * sliding `windowMs`. Rejection surfaces as a 429 with code RATE_LIMITED and a
 * small `retryAfterSeconds` detail so clients know when to retry.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const {
    limit,
    windowMs,
    code = RATE_LIMITED,
    message = "Too many requests. Please try again later.",
    key = (req) => req.ip ?? "unknown",
    enabled = true,
  } = options

  return (req, _res, next) => {
    if (!enabled) {
      next()
      return
    }

    const now = Date.now()
    // Opportunistic cleanup keeps the map from growing unbounded.
    if (store.size > 10_000) prune(now)

    const clientKey = key(req)
    const bucket = store.get(clientKey)

    if (!bucket || bucket.resetAt <= now) {
      store.set(clientKey, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    if (bucket.count < limit) {
      bucket.count += 1
      next()
      return
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    next(
      new ApiError(429, code, message, {
        retryAfterSeconds,
      }),
    )
  }
}
