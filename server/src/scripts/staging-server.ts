import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  STAGING_PROJECT_LABEL,
  parseStagingTargetArgs,
  resolveStagingTarget,
} from "../lib/staging-target.js"

export function isDirectExecution(
  entryPath: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (entryPath === undefined || entryPath.trim() === "") return false
  try {
    const entry = path.resolve(entryPath)
    const current = fileURLToPath(moduleUrl)
    return process.platform === "win32"
      ? entry.toLowerCase() === current.toLowerCase()
      : entry === current
  } catch {
    return false
  }
}

function sanitize(message: string): string {
  return message.replace(/:\/\/[^\s@"']*@/g, "://***:***@")
}

async function main(): Promise<void> {
  const args = parseStagingTargetArgs(process.argv.slice(2))
  const target = resolveStagingTarget(process.env, args)

  process.env.DATABASE_URL = target.raw
  process.env.SMS_STAGING_SERVER = "1"

  console.log(`staging server — project: ${STAGING_PROJECT_LABEL}`)
  console.log(`target: ${target.display}`)

  await import("../server.js")
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    console.error(sanitize(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  })
}
