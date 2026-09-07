import { env } from "../config/env.js"
import { getPrisma } from "../lib/database.js"

export interface HealthPayload {
  status: "ok"
  uptime: number
  timestamp: string
  version: string
  env: string
  /**
   * Readiness signal: whether the database answered a trivial probe. The HTTP
   * status stays 200 either way (liveness), but operators can distinguish a
   * process that is up from a process that can actually serve data.
   */
  database: "ok" | "unreachable"
}

export async function getHealth(): Promise<HealthPayload> {
  let database: "ok" | "unreachable" = "unreachable"
  try {
    const prisma = await getPrisma()
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`
      database = "ok"
    }
  } catch {
    // A DB ping failure only affects the readiness field — never the process
    // liveness signal, and never leaks connection details to the client.
  }

  return {
    status: "ok",
    uptime: Math.round(process.uptime() * 100) / 100,
    timestamp: new Date().toISOString(),
    version: "v1",
    env: env.nodeEnv,
    database,
  }
}