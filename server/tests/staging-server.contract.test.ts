import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const readSource = (relative: string): string =>
  readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8")

const command = readSource("src/scripts/staging-server.ts")
const config = readSource("src/config/env.ts")

describe("staging server source contract", () => {
  it("never reads an env file of its own", () => {
    expect(command).not.toContain("dotenv")
    expect(command).not.toContain("loadEnvFile")
  })

  it("resolves the guarded target before setting DATABASE_URL and starting the server", () => {
    const guard = command.indexOf("resolveStagingTarget(process.env, args)")
    const setDatabaseUrl = command.indexOf("process.env.DATABASE_URL = target.raw")
    const startServer = command.indexOf('await import("../server.js")')

    expect(guard).toBeGreaterThanOrEqual(0)
    expect(setDatabaseUrl).toBeGreaterThan(guard)
    expect(startServer).toBeGreaterThan(setDatabaseUrl)
  })

  it("prints only the project and redacted target summary", () => {
    expect(command).toContain("STAGING_PROJECT_LABEL")
    expect(command).toContain("target.display")
    expect(command).not.toContain("STAGING_DATABASE_URL")
    expect(command).not.toMatch(/console\.(?:log|info|warn|error)\([^)]*target\.raw/s)
  })

  it("does not set or select production mode", () => {
    expect(command).not.toMatch(/process\.env\.NODE_ENV\s*=/)
    expect(command).not.toMatch(/NODE_ENV\s*=\s*["']production["']/)
  })

  it("disables the server's env-file load before importing the entry point", () => {
    const stagingFlag = command.indexOf('process.env.SMS_STAGING_SERVER = "1"')
    const startServer = command.indexOf('await import("../server.js")')
    const skipCheck = config.indexOf('process.env.SMS_STAGING_SERVER === "1"')
    const loadEnvFile = config.indexOf("process.loadEnvFile()")

    expect(stagingFlag).toBeGreaterThanOrEqual(0)
    expect(startServer).toBeGreaterThan(stagingFlag)
    expect(skipCheck).toBeGreaterThanOrEqual(0)
    expect(loadEnvFile).toBeGreaterThan(skipCheck)
  })

  it("registers only the staging server script", () => {
    const packageJson = JSON.parse(readSource("../package.json")) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts["staging:server"]).toBe(
      "tsx server/src/scripts/staging-server.ts",
    )
  })
})
