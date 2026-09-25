import { env } from "../config/env.js"
import { serviceUnavailableError } from "../lib/ApiError.js"
import { getPrisma } from "../lib/database.js"

export interface LivenessPayload {
  status: "ok"
  uptime: number
  timestamp: string
  version: string
  env: string
}

export interface ReadinessPayload extends LivenessPayload {
  database: "ok"
}

export interface HealthPayload extends LivenessPayload {
  database: "ok" | "unreachable"
}

let databaseProbeInFlight: Promise<boolean> | undefined

function getProcessPayload(): LivenessPayload {
  return {
    status: "ok",
    uptime: Math.round(process.uptime() * 100) / 100,
    timestamp: new Date().toISOString(),
    version: "v1",
    env: env.nodeEnv,
  }
}

async function runDatabaseProbe(): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined
  const databaseProbe = (async () => {
    const prisma = await getPrisma()
    if (!prisma) return false

    await prisma.$queryRaw`SELECT 1`
    return true
  })()

  try {
    return await Promise.race([
      databaseProbe,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness probe timed out")), env.health.readinessTimeoutMs)
        timeout.unref()
      }),
    ])
  } catch {
    return false
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function getDatabaseProbe(): Promise<boolean> {
  if (databaseProbeInFlight) return databaseProbeInFlight

  const probe = runDatabaseProbe()
  databaseProbeInFlight = probe

  try {
    return await probe
  } finally {
    if (databaseProbeInFlight === probe) databaseProbeInFlight = undefined
  }
}

export function getLiveness(): LivenessPayload {
  return getProcessPayload()
}

export async function getReadiness(): Promise<ReadinessPayload> {
  if (!(await getDatabaseProbe())) throw serviceUnavailableError()

  return {
    ...getProcessPayload(),
    database: "ok",
  }
}

export async function getHealth(): Promise<HealthPayload> {
  const database = (await getDatabaseProbe()) ? "ok" : "unreachable"

  return {
    ...getProcessPayload(),
    database,
  }
}
