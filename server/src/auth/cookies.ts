import type { Response } from "express"
import { env } from "../config/env.js"

export const ACCESS_COOKIE = "sms.access"
export const REFRESH_COOKIE = "sms.refresh"

function cookieOptionsFor(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.session.cookieSecure,
    path: "/",
    maxAge: maxAgeMs,
  }
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptionsFor(env.session.accessTtlMs))
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptionsFor(env.session.refreshTtlMs))
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, cookieOptionsFor(env.session.accessTtlMs))
  res.clearCookie(REFRESH_COOKIE, cookieOptionsFor(env.session.refreshTtlMs))
}

/** Minimal cookie parser (we intentionally avoid a cookie-parser dependency). */
export function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const chunk of cookieHeader.split(";")) {
    const separator = chunk.indexOf("=")
    if (separator === -1) continue
    const key = chunk.slice(0, separator).trim()
    if (key === name) return chunk.slice(separator + 1).trim()
  }
  return undefined
}