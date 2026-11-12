import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  parseStagingTargetArgs,
  resolveStagingTarget,
  STAGING_PROJECT_LABEL,
  type StagingTarget,
  type StagingTargetArgs,
} from "../lib/staging-target.js"

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(MODULE_DIR, "../../..")
const PRISMA_CLI = path.join(REPO_ROOT, "node_modules", "prisma", "build", "index.js")
const PRISMA_CLIENT = path.join(REPO_ROOT, "node_modules", ".prisma", "client", "index.js")
const PRISMA_SCHEMA = path.resolve(MODULE_DIR, "../../prisma/schema.prisma")
const SCHEMA_ENV_FILE = path.resolve(MODULE_DIR, "../../prisma/.env")
const PRISMA_CHILD_ENV_ALLOWLIST = [
  "PATH",
  "Path",
  "PATHEXT",
  "COMSPEC",
  "ComSpec",
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
] as const

type Mode = "check" | "status" | "apply"
type PrismaMigrateCommand = "deploy" | "status"

export interface StagingMigrateArgs {
  mode: Mode
  targetArgs: StagingTargetArgs
}

interface PrismaMigrateResult {
  exitCode: number
  output: string
}

function fail(detail: string): never {
  throw new Error(`Refusing staging migration: ${detail}`)
}

export function parseStagingMigrateArgs(argv: readonly string[]): StagingMigrateArgs {
  let mode: Mode | null = null
  const targetArgv: string[] = []

  for (const arg of argv) {
    if (arg === "--check" || arg === "--status" || arg === "--apply") {
      if (mode !== null) {
        fail("use exactly one of --check, --status, or --apply.")
      }
      mode = arg === "--check" ? "check" : arg === "--status" ? "status" : "apply"
      continue
    }
    targetArgv.push(arg)
  }

  if (mode === null) {
    fail("one of --check, --status, or --apply is required.")
  }

  return { mode, targetArgs: parseStagingTargetArgs(targetArgv) }
}

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

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function secretValues(target: StagingTarget): string[] {
  const values = new Set<string>([target.raw])
  try {
    const url = new URL(target.raw)
    for (const value of [url.username, url.password]) {
      if (value === "") continue
      values.add(value)
      values.add(safeDecode(value))
    }
    const sslPassword = url.searchParams.get("sslpassword")
    if (sslPassword !== null && sslPassword !== "") {
      values.add(sslPassword)
      values.add(safeDecode(sslPassword))
    }
  } catch {
    return [...values].filter((value) => value !== "")
  }
  return [...values].filter((value) => value !== "")
}

function sanitize(text: string, target: StagingTarget): string {
  return secretValues(target).reduce(
    (result, secret) => result.replaceAll(secret, "<redacted>"),
    text,
  )
}

function assertPrismaIsolation(): void {
  if (!existsSync(PRISMA_CLI)) {
    fail("the Prisma CLI is not installed at node_modules/prisma/build/index.js.")
  }
  if (!existsSync(PRISMA_SCHEMA)) {
    fail("the Prisma schema is missing at server/prisma/schema.prisma.")
  }
  if (existsSync(SCHEMA_ENV_FILE)) {
    fail("server/prisma/.env exists; refusing to let Prisma load an environment file.")
  }
  if (!existsSync(PRISMA_CLIENT)) {
    fail("the generated Prisma client is missing; run npm run generate:prisma.")
  }

  const generated = readFileSync(PRISMA_CLIENT, "utf8")
  const relativeEnvPaths = /"relativeEnvPaths":\s*\{([^}]*)\}/.exec(generated)
  if (relativeEnvPaths === null) {
    fail("cannot verify that the generated Prisma client is free of .env paths.")
  }

  const body = relativeEnvPaths[1]
  const rootKey = /\brootEnvPath\b/.test(body)
  const schemaKey = /\bschemaEnvPath\b/.test(body)
  const rootEnvPath = /"rootEnvPath":\s*("(?:[^"\\]|\\.)*"|null)/.exec(body)
  const schemaEnvPath = /"schemaEnvPath":\s*("(?:[^"\\]|\\.)*"|null)/.exec(body)

  if (!rootKey || (rootKey && rootEnvPath === null)) {
    fail("cannot verify that the generated Prisma client has no root .env path.")
  }
  if (schemaKey && schemaEnvPath === null) {
    fail("cannot verify that the generated Prisma client has no schema .env path.")
  }

  const hasRootEnvPath = rootEnvPath !== null && rootEnvPath[1] !== "null"
  const hasSchemaEnvPath = schemaEnvPath !== null && schemaEnvPath[1] !== "null"
  if (hasRootEnvPath || hasSchemaEnvPath) {
    fail(
      "the generated Prisma client carries .env paths; refusing to import it. " +
        "Regenerate the client without an .env file before retrying.",
    )
  }
}

async function verifyDatabaseIdentity(target: StagingTarget): Promise<void> {
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient({
    datasourceUrl: target.raw,
    __internal: {
      configOverride: (config: Record<string, unknown>) => ({
        ...config,
        relativeEnvPaths: { rootEnvPath: null, schemaEnvPath: null },
        injectableEdgeEnv: undefined,
      }),
    },
  } as unknown as ConstructorParameters<typeof PrismaClient>[0])

  try {
    const rows = await prisma.$queryRaw<Array<{ database: string; user: string; port: number }>>`
      SELECT current_database() AS database, current_user AS "user", inet_server_port() AS port
    `
    const row: { database: string; user: string; port: number } | undefined = rows[0]
    if (row === undefined) {
      throw new Error("the identity query returned no rows.")
    }

    const port = String(row.port)
    if (row.database !== target.database || row.user !== target.user || port !== target.port) {
      throw new Error(
        `connected database identity (database=${row.database}, port=${port}) does not match ` +
          `the confirmed staging target (database=${target.database}, port=${target.port}).`,
      )
    }

    console.log(`Verified staging database identity: database=${row.database} port=${port}`)
  } finally {
    await prisma.$disconnect()
  }
}

function buildPrismaChildEnv(target: StagingTarget): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of PRISMA_CHILD_ENV_ALLOWLIST) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.DATABASE_URL = target.raw
  return env
}

function countPendingMigrations(output: string): number {
  const lines = output.split(/\r?\n/)
  const marker = lines.findIndex((line) => line.includes("have not yet been applied"))
  if (marker === -1) return 0

  let count = 0
  let started = false
  for (const line of lines.slice(marker + 1)) {
    const trimmed = line.trim()
    if (trimmed === "") {
      if (started) break
      continue
    }
    if (trimmed.startsWith("To apply") || trimmed.startsWith("Run ")) break
    started = true
    count += 1
  }
  return count
}

function runPrismaMigrate(
  target: StagingTarget,
  command: PrismaMigrateCommand,
): PrismaMigrateResult {
  if (existsSync(SCHEMA_ENV_FILE)) {
    fail("server/prisma/.env appeared before deploy; refusing to let Prisma load an environment file.")
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "sms-staging-migrate-"))

  try {
    writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "sms-staging-migrate-temp", private: true }),
      "utf8",
    )

    const env = buildPrismaChildEnv(target)

    try {
      const output = sanitize(
        execFileSync(
          process.execPath,
          [PRISMA_CLI, "migrate", command, "--schema", PRISMA_SCHEMA],
          { cwd: tempDir, env, stdio: "pipe" },
        ).toString(),
        target,
      )
      if (command === "deploy" && output.trim() !== "") {
        console.log(output.trim())
      }
      return { exitCode: 0, output }
    } catch (error) {
      const caught = error as {
        status?: number
        stdout?: Buffer | string
        stderr?: Buffer | string
      }
      const output = sanitize(
        `${caught.stdout?.toString() ?? ""}${caught.stderr?.toString() ?? ""}`.trim(),
        target,
      )
      if (command === "status") {
        const exitCode =
          typeof caught.status === "number" && caught.status !== 0 ? caught.status : 1
        return { exitCode, output }
      }
      if (output !== "") {
        process.stderr.write(`${output}\n`)
      }
      const status = caught.status === undefined ? "" : ` (exit code ${caught.status})`
      fail(`Prisma migrate ${command} failed${status}.`)
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function runPrismaDeploy(target: StagingTarget): void {
  runPrismaMigrate(target, "deploy")
}

async function main(): Promise<void> {
  const parsed = parseStagingMigrateArgs(process.argv.slice(2))
  const target = resolveStagingTarget(process.env, parsed.targetArgs)

  if (parsed.mode === "check") {
    console.log(
      `Staging target check passed: ${target.display} (project: ${STAGING_PROJECT_LABEL}).`,
    )
    console.log("No database connection was made and no Prisma process was started.")
    return
  }

  assertPrismaIsolation()

  try {
    await verifyDatabaseIdentity(target)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`read-only identity check failed; no migration was started: ${sanitize(message, target)}`)
  }

  if (parsed.mode === "status") {
    const result = runPrismaMigrate(target, "status")
    if (result.exitCode === 0) {
      console.log("Staging migrations: up to date.")
    } else if (result.output.includes("have not yet been applied")) {
      const count = countPendingMigrations(result.output)
      console.log(
        `Staging migrations: pending (${count} listed). Review SQL before any --apply.`,
      )
    } else {
      console.log("Staging migration status failed.")
      process.exitCode = 1
    }
    return
  }

  if (parsed.mode === "apply") {
    console.log(
      `Applying staging migrations to ${target.display} (project: ${STAGING_PROJECT_LABEL}).`,
    )
    runPrismaDeploy(target)
    console.log("Staging migrations applied.")
  }
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    const record = (typeof error === "object" && error !== null ? error : {}) as {
      name?: unknown
      code?: unknown
    }
    const name = typeof record.name === "string" ? record.name : ""
    const rawCode = record.code
    const code =
      typeof rawCode === "string" &&
      (/^P\d{4}$/.test(rawCode) || /^[A-Z_]{2,40}$/.test(rawCode))
        ? rawCode
        : ""
    const detail = [name, code === "" ? "" : `(${code})`]
      .filter((part) => part !== "")
      .join(" ")
    console.error(
      detail === ""
        ? "Staging migration command failed."
        : `Staging migration command failed: ${detail}.`,
    )
    process.exitCode = 1
  })
}
