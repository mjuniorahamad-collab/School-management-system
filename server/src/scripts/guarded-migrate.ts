import { execFileSync } from "node:child_process"
import {
  assertDirectDatabaseUrl,
  isLocalDatabaseTarget,
  parseDatabaseTarget,
  redactDatabaseUrl,
} from "../lib/database-target.js"
import {
  assertRemoteApprovals,
  parseDeploymentArgs,
  resolveMigrationExecutionTarget,
} from "../lib/migration-target.js"

const PRISMA_CLI = "node_modules/prisma/build/index.js"
const SCHEMA = "server/prisma/schema.prisma"

try {
  process.loadEnvFile()
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  if (code !== "ENOENT") throw error
}

function requiredDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.DATABASE_URL
  if (raw === undefined || raw.trim() === "") {
    throw new Error("Refusing to migrate: DATABASE_URL is not set.")
  }
  return raw
}

function sanitize(text: string, secrets: string[]): string {
  return secrets.reduce((result, secret) => result.replaceAll(secret, "<redacted>"), text)
}

function runPrisma(args: string[], databaseUrl: string, secrets: string[]): void {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl }
  delete env.MIGRATION_DATABASE_URL

  try {
    execFileSync(process.execPath, [PRISMA_CLI, ...args], { env, stdio: "pipe" })
  } catch (error) {
    const caught = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
    const output = `${caught.stdout?.toString() ?? ""}${caught.stderr?.toString() ?? ""}`.trim()
    if (output !== "") {
      process.stderr.write(`${sanitize(output, secrets)}\n`)
    }
    const status = caught.status === undefined ? "" : ` (exit code ${caught.status})`
    throw new Error(`Prisma migration failed${status}.`)
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2]
  const raw = requiredDatabaseUrl(process.env)
  const target = parseDatabaseTarget(raw)
  if (target === null) {
    throw new Error("Refusing to migrate: DATABASE_URL is not a parseable PostgreSQL connection string.")
  }

  if (mode === "dev") {
    if (!isLocalDatabaseTarget(target)) {
      throw new Error(
        "Refusing to run prisma migrate dev: only loopback or Unix-socket databases are allowed. " +
          "Use db:migrate for remote deployment migrations.",
      )
    }
    assertDirectDatabaseUrl(raw, "running prisma migrate dev")
    const extraArgs = process.argv.slice(3)
    console.log(`Applying development migrations to ${redactDatabaseUrl(raw)}`)
    runPrisma(["migrate", "dev", "--schema", SCHEMA, ...extraArgs], raw, [raw])
    return
  }

  if (mode !== "deploy") {
    throw new Error("Usage: guarded-migrate <deploy|dev> [options]")
  }

  const direct = resolveMigrationExecutionTarget(raw, process.env)
  const approval = parseDeploymentArgs(process.argv.slice(3))
  const remote = !isLocalDatabaseTarget(direct)

  if (remote) {
    assertRemoteApprovals(direct, process.env, approval)
  } else if (approval.allowProduction) {
    throw new Error("Refusing to migrate: --allow-production is not valid for a local database.")
  }

  const secrets = [raw, direct.raw, process.env.MIGRATION_DATABASE_URL ?? ""].filter(
    (value) => value !== "",
  )
  console.log(`Applying deployment migrations to ${direct.displayUrl}`)
  runPrisma(["migrate", "deploy", "--schema", SCHEMA], direct.raw, secrets)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
