import type { RequestHandler } from "express"
import { z } from "zod"
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  getCookie,
  setAuthCookies,
} from "../auth/cookies.js"
import { unauthorizedError } from "../lib/ApiError.js"
import { parseWithZod } from "../lib/validation.js"
import { doLogin, doLogout, doRefresh } from "../services/auth.service.js"
import { ok } from "../lib/response.js"

const loginSchema = z.object({
  email: z.email("A valid email address is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200, "Password is too long"),
})

export const loginHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(loginSchema, req.body, "Invalid login details")

  const { user, tokens } = await doLogin(input)
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken)
  res.json(ok({ user }))
}

export const refreshHandler: RequestHandler = async (req, res) => {
  const refreshToken = getCookie(req.headers.cookie, REFRESH_COOKIE)
  if (!refreshToken) throw unauthorizedError("Missing refresh token")

  const tokens = await doRefresh(refreshToken)
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken)
  res.json(ok({ refreshed: true }))
}

export const logoutHandler: RequestHandler = async (req, res) => {
  const accessToken = getCookie(req.headers.cookie, ACCESS_COOKIE)
  await doLogout(accessToken)
  clearAuthCookies(res)
  res.json(ok({ success: true }))
}

export const meHandler: RequestHandler = (req, res) => {
  if (!req.auth) throw unauthorizedError("Authentication required")
  res.json(ok({ user: req.auth }))
}