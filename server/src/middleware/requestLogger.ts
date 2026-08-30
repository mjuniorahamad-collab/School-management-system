import type { Request, RequestHandler, Response } from "express"
import { logRequest } from "../lib/logger.js"

export const requestLogger: RequestHandler = (req: Request, res: Response, next) => {
  const startedAt = process.hrtime.bigint()

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    logRequest(req.method, req.originalUrl, res.statusCode, durationMs)
  })

  next()
}