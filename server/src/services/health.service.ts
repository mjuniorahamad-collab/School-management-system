import { env } from "../config/env.js"

export interface HealthPayload {
  status: "ok"
  uptime: number
  timestamp: string
  version: string
  env: string
}

export function getHealth(): HealthPayload {
  return {
    status: "ok",
    uptime: Math.round(process.uptime() * 100) / 100,
    timestamp: new Date().toISOString(),
    version: "v1",
    env: env.nodeEnv,
  }
}