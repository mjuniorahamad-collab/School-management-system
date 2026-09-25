import type { Request, Response } from "express"
import { ok } from "../lib/response.js"
import { getHealth, getLiveness, getReadiness } from "../services/health.service.js"

function disableHealthCaching(res: Response): void {
  res.setHeader("Cache-Control", "no-store")
}

export function livenessHandler(_req: Request, res: Response): void {
  disableHealthCaching(res)
  res.json(ok(getLiveness()))
}

export async function readinessHandler(_req: Request, res: Response): Promise<void> {
  disableHealthCaching(res)
  res.json(ok(await getReadiness()))
}

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  disableHealthCaching(res)
  res.json(ok(await getHealth()))
}
