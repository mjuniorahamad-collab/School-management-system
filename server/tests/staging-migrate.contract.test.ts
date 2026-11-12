import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parseStagingMigrateArgs } from "../src/scripts/staging-migrate.js"

const STAGING_HOST = "ep-staging-123456.eu-central-1.aws.neon.tech"
const STAGING_DATABASE = "neondb"
const PRISMA_CONFIG_PATHS = [
  "prisma.config.ts",
  "server/prisma.config.ts",
  "server/prisma/prisma.config.ts",
] as const

const TARGET_ARGS = [
  "--target-env",
  "STAGING_DATABASE_URL",
  "--staging-project",
  "sms-integration-test",
  "--confirm-host",
  STAGING_HOST,
  "--confirm-port",
  "5432",
  "--confirm-database",
  STAGING_DATABASE,
]

function repoFile(relative: string): string {
  return readFileSync(path.resolve(process.cwd(), relative), "utf8")
}

function optionalRepoFile(relative: string): string {
  return existsSync(path.resolve(process.cwd(), relative)) ? repoFile(relative) : ""
}

describe("parseStagingMigrateArgs", () => {
  it("requires exactly one mode flag", () => {
    expect(parseStagingMigrateArgs(["--check", ...TARGET_ARGS])).toMatchObject({
      mode: "check",
      targetArgs: {
        targetEnv: "STAGING_DATABASE_URL",
        stagingProject: "sms-integration-test",
        confirmHost: STAGING_HOST,
        confirmPort: "5432",
        confirmDatabase: STAGING_DATABASE,
      },
    })

    expect(parseStagingMigrateArgs(["--status", ...TARGET_ARGS]).mode).toBe("status")
    expect(parseStagingMigrateArgs(["--apply", ...TARGET_ARGS]).mode).toBe("apply")
    expect(() => parseStagingMigrateArgs(TARGET_ARGS)).toThrow(
      /one of --check, --status, or --apply is required/i,
    )
    expect(() => parseStagingMigrateArgs(["--check", "--status", ...TARGET_ARGS])).toThrow(
      /exactly one of --check, --status, or --apply/i,
    )
    expect(() => parseStagingMigrateArgs(["--status", "--apply", ...TARGET_ARGS])).toThrow(
      /exactly one of --check, --status, or --apply/i,
    )
    expect(() => parseStagingMigrateArgs(["--apply", "--status", ...TARGET_ARGS])).toThrow(
      /exactly one of --check, --status, or --apply/i,
    )
  })
})

describe("staging migration source contract", () => {
  const wrapper = repoFile("server/src/scripts/staging-migrate.ts")
  const guard = repoFile("server/src/lib/staging-target.ts")

  it("never loads .env or delegates to the legacy guarded wrapper", () => {
    for (const source of [wrapper, guard]) {
      expect(source).not.toContain("loadEnvFile")
      expect(source).not.toContain("dotenv")
      expect(source).not.toContain("guarded-migrate")
    }
  })

  it("isolates the Prisma CLI from environment files and absolute-path discovery", () => {
    expect(wrapper).toContain("mkdtempSync")
    expect(wrapper).toContain("package.json")
    expect(wrapper).toContain("SCHEMA_ENV_FILE")
    expect(wrapper).toContain("server/prisma/.env")
    expect(wrapper).toContain("PRISMA_CLIENT")
    expect(wrapper).toContain("relativeEnvPaths")
    expect(wrapper).toContain('"migrate", command')
    expect(wrapper).toContain('"deploy" | "status"')
    expect(wrapper).toContain("PRISMA_SCHEMA")
  })

  it("routes status through the read-only Prisma path", () => {
    const statusStart = wrapper.indexOf('if (parsed.mode === "status")')
    const statusEnd = wrapper.indexOf('if (parsed.mode === "apply")')
    expect(statusStart).toBeGreaterThanOrEqual(0)
    expect(statusEnd).toBeGreaterThan(statusStart)
    const statusBranch = wrapper.slice(statusStart, statusEnd)

    expect(statusBranch).toContain('runPrismaMigrate(target, "status")')
    expect(statusBranch).toContain("have not yet been applied")
    expect(statusBranch).toContain("Staging migrations: up to date.")
    expect(statusBranch).toContain("Staging migrations: pending (")
    expect(statusBranch).toContain("Review SQL before any --apply.")
    expect(statusBranch).toContain("Staging migration status failed.")
    expect(statusBranch).toContain("countPendingMigrations")
    expect(statusBranch).not.toContain("runPrismaDeploy")
    expect(statusBranch).not.toContain("error.message")
    expect(statusBranch).not.toContain("String(error)")
    expect(wrapper.indexOf("assertPrismaIsolation()")).toBeLessThan(statusStart)
    expect(wrapper.indexOf("await verifyDatabaseIdentity(target)")).toBeLessThan(statusStart)
  })

  it("prints only an allowlisted top-level error name and code", () => {
    const catchStart = wrapper.indexOf("main().catch")
    expect(catchStart).toBeGreaterThanOrEqual(0)
    const catchBlock = wrapper.slice(catchStart)

    expect(catchBlock).toContain("Staging migration command failed")
    expect(catchBlock).toContain(".name")
    expect(catchBlock).toContain(".code")
    expect(catchBlock).toContain("/^P\\d{4}$/")
    expect(catchBlock).toContain("/^[A-Z_]{2,40}$/")
    expect(catchBlock).not.toContain("error.message")
    expect(catchBlock).not.toContain("String(error)")
  })

  it("builds the Prisma child env from the schema and config env contract", () => {
    const schema = repoFile("server/prisma/schema.prisma")
    const config = PRISMA_CONFIG_PATHS.map(optionalRepoFile).join("\n")
    const envNames = new Set<string>()

    for (const source of [schema, config]) {
      for (const match of source.matchAll(/\benv\(\s*["']([^"']+)["']\s*\)/g)) {
        envNames.add(match[1])
      }
    }

    const builderStart = wrapper.indexOf("function buildPrismaChildEnv")
    const builderEnd = wrapper.indexOf("function runPrismaMigrate")
    expect(builderStart).toBeGreaterThanOrEqual(0)
    expect(builderEnd).toBeGreaterThan(builderStart)
    const builder = wrapper.slice(builderStart, builderEnd)

    expect(envNames.size).toBeGreaterThan(0)
    for (const name of envNames) {
      expect(builder).toContain(name)
    }
    expect(builder).toContain("PRISMA_CHILD_ENV_ALLOWLIST")
    expect(builder).toContain("env.DATABASE_URL = target.raw")
    expect(builder).not.toContain("...process.env")
  })

  it("verifies the database identity before running the deploy", () => {
    expect(wrapper).toContain("verifyDatabaseIdentity")
    expect(wrapper).toContain("datasourceUrl")
    expect(wrapper).toContain("configOverride")
    expect(wrapper).toContain("relativeEnvPaths")
    expect(wrapper).toContain("injectableEdgeEnv")
    expect(wrapper).toContain("current_database()")
    expect(wrapper).toContain("current_user")
    expect(wrapper).toContain("inet_server_port()")
  })

  it("registers only the staging migration script", () => {
    const packageJson = JSON.parse(repoFile("package.json")) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts["db:migrate:staging"]).toBe(
      "tsx server/src/scripts/staging-migrate.ts",
    )
  })
})
