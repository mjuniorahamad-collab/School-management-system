import { randomBytes } from "node:crypto"
import type { Request, RequestHandler, Response } from "express"
import { logRequest } from "../lib/logger.js"

const REQUEST_ID_HEADER = "x-request-id"
// Client-supplied request ids are only forwarded when they are safe, opaque
// tokens; anything else is replaced with a fresh server-generated id so logs
// never echo arbitrary client-shaped values.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export const requestLogger: RequestHandler = (req: Request, res: Response, next) => {
  const startedAt = process.hrtime.bigint()

  const inbound = req.headers[REQUEST_ID_HEADER]
  const requestId =
    typeof inbound === "string" && REQUEST_ID_PATTERN.test(inbound)
      ? inbound
      : randomBytes(8).toString("hex")

  res.locals.requestId = requestId
  res.setHeader("X-Request-Id", requestId)

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    logRequest({
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      requestId,
      userId: req.auth?.id,
    })
  })

  next()
}