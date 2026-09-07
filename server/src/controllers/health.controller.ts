import type { Request, Response } from "express"
import { ok } from "../lib/response.js"
import { getHealth } from "../services/health.service.js"

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  res.json(ok(await getHealth()))
}