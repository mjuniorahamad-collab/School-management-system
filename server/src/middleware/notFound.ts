import type { RequestHandler } from "express"
import { fail } from "../lib/response.js"

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(fail("NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found`))
}