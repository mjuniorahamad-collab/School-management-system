import { isIP } from "node:net"
import {
  canonicalizeHost,
  isLoopbackHost,
  isPooledHost,
  parseDatabaseTarget,
  readProductionIdentity,
  type DatabaseTarget,
} from "./database-target.js"

const STAGING_PORT = "5432"
const STAGING_TLS_MODES = new Set(["require", "verify-ca", "verify-full"])
const ALLOWED_QUERY_PARAMS = new Set([
  "sslmode",
  "channel_binding",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
  "connect_timeout",
  "application_name",
])
const TARGET_FLAGS = new Set([
  "--target-env",
  "--staging-project",
  "--confirm-host",
  "--confirm-port",
  "--confirm-database",
])

export const STAGING_DATABASE_URL_ENV = "STAGING_DATABASE_URL"
export const STAGING_PROJECT_LABEL = "sms-integration-test"

function isIpv4MappedLoopbackOrUnspecified(hostname: string): boolean {
  let canonical: string
  try {
    canonical = new URL(`http://[${hostname}]/`).hostname.slice(1, -1)
  } catch {
    return false
  }
  if (isIP(canonical) !== 6) return false

  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical)
  if (match === null) return false

  const high = Number.parseInt(match[1] ?? "", 16)
  const low = Number.parseInt(match[2] ?? "", 16)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return false

  const first = high >> 8
  const second = high & 0xff
  const third = low >> 8
  const fourth = low & 0xff

  if (first === 127) return true
  return first === 0 && second === 0 && third === 0 && fourth === 0
}

function isLoopbackOrUnspecifiedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  if (isLoopbackHost(host)) return true
  if (host === "0.0.0.0" || host === "::" || host === "0:0:0:0:0:0:0:0") return true
  if (/^127(?:\.\d{1,3}){1,3}$/.test(host)) return true
  return isIpv4MappedLoopbackOrUnspecified(host)
}

function isPooledStagingHost(hostname: string): boolean {
  const labels = hostname.toLowerCase().split(".")
  return isPooledHost(hostname) || labels.some((label) => label.includes("pgbouncer"))
}

export interface StagingTarget {
  raw: string
  host: string
  port: string
  database: string
  user: string
  display: string
}

export interface StagingTargetArgs {
  targetEnv: string
  stagingProject: string
  confirmHost: string
  confirmPort: string
  confirmDatabase: string
}

function fail(detail: string): never {
  throw new Error(`Refusing staging migration: ${detail}`)
}

// PRODUCTION_DATABASE_NAME is required and validated, but it is not a deny key:
// staging and production may legitimately share the same database name.
function productionHost(env: Record<string, string | undefined>): string {
  try {
    return readProductionIdentity(env).host
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(message.replace(/^Refusing to continue:\s*/i, ""))
  }
}

function stagingHost(hostname: string): string {
  try {
    return canonicalizeHost(hostname)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

function parseStagingUrl(raw: string): URL {
  try {
    return new URL(raw)
  } catch {
    fail(`${STAGING_DATABASE_URL_ENV} is not a parseable PostgreSQL connection string.`)
  }
}

function parseStagingDatabase(raw: string): DatabaseTarget {
  let target: DatabaseTarget | null = null
  try {
    target = parseDatabaseTarget(raw)
  } catch {
    fail(`${STAGING_DATABASE_URL_ENV} is not a parseable PostgreSQL connection string.`)
  }
  if (target === null) {
    fail(`${STAGING_DATABASE_URL_ENV} is not a parseable PostgreSQL connection string.`)
  }
  return target
}

export function parseStagingTargetArgs(argv: readonly string[]): StagingTargetArgs {
  const values = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ""
    if (!arg.startsWith("--")) {
      fail("unsupported argument.")
    }

    const equals = arg.indexOf("=")
    const flag = equals === -1 ? arg : arg.slice(0, equals)
    if (!TARGET_FLAGS.has(flag)) {
      fail("unsupported argument.")
    }
    if (values.has(flag)) {
      fail(`${flag} was provided more than once.`)
    }

    let value: string
    if (equals === -1) {
      const next: string | undefined = argv[index + 1]
      if (next === undefined || next.startsWith("--")) {
        fail(`${flag} requires a value.`)
      }
      value = next
      index += 1
    } else {
      value = arg.slice(equals + 1)
    }

    const trimmed = value.trim()
    if (trimmed === "") {
      fail(`${flag} requires a non-empty value.`)
    }
    values.set(flag, trimmed)
  }

  const targetEnv = values.get("--target-env")
  const stagingProject = values.get("--staging-project")
  const confirmHost = values.get("--confirm-host")
  const confirmPort = values.get("--confirm-port")
  const confirmDatabase = values.get("--confirm-database")

  if (targetEnv === undefined) fail("--target-env is required.")
  if (stagingProject === undefined) fail("--staging-project is required.")
  if (confirmHost === undefined) fail("--confirm-host is required.")
  if (confirmPort === undefined) fail("--confirm-port is required.")
  if (confirmDatabase === undefined) fail("--confirm-database is required.")

  return { targetEnv, stagingProject, confirmHost, confirmPort, confirmDatabase }
}

export function resolveStagingTarget(
  env: Record<string, string | undefined>,
  args: StagingTargetArgs,
): StagingTarget {
  const targetEnv = args.targetEnv.trim()
  if (targetEnv !== STAGING_DATABASE_URL_ENV) {
    fail(`--target-env must be ${STAGING_DATABASE_URL_ENV}.`)
  }

  if ((env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    fail("NODE_ENV=production is set; the staging wrapper never runs in production mode.")
  }

  if ((env.NODE_TLS_REJECT_UNAUTHORIZED ?? "").trim() === "0") {
    fail("NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS verification; unset it before running this command.")
  }

  if (env.NODE_OPTIONS !== undefined && env.NODE_OPTIONS !== "") {
    fail("NODE_OPTIONS is set; unset it before running this command.")
  }

  const envFileOverrides = Object.keys(env).filter(
    (key) => key.toUpperCase().startsWith("DOTENV_") && (env[key] ?? "").trim() !== "",
  )
  if (envFileOverrides.length > 0) {
    fail(`DOTENV_* configuration is set (${envFileOverrides.join(", ")}); unset it before running this command.`)
  }

  if (args.stagingProject.trim() !== STAGING_PROJECT_LABEL) {
    fail(`--staging-project must be ${STAGING_PROJECT_LABEL}.`)
  }

  const conflictingUrls = Object.keys(env).filter(
    (key) =>
      key.toUpperCase() !== STAGING_DATABASE_URL_ENV &&
      key.toUpperCase().includes("DATABASE_URL") &&
      (env[key] ?? "").trim() !== "",
  )
  if (conflictingUrls.length > 0) {
    fail(
      `conflicting connection strings (${conflictingUrls.join(", ")}) are set; ` +
        `the staging wrapper reads only ${STAGING_DATABASE_URL_ENV}.`,
    )
  }

  const pgOverrides = Object.keys(env).filter(
    (key) => /^PG[A-Z0-9_]*$/i.test(key) && (env[key] ?? "").trim() !== "",
  )
  if (pgOverrides.length > 0) {
    fail(`libpq environment overrides are set (${pgOverrides.join(", ")}); unset them before running this command.`)
  }

  const raw = (env[STAGING_DATABASE_URL_ENV] ?? "").trim()
  if (raw === "") {
    fail(`${STAGING_DATABASE_URL_ENV} is not set; pass it explicitly in the shell environment.`)
  }

  const target = parseStagingDatabase(raw)
  if (target.socket) {
    fail(`${STAGING_DATABASE_URL_ENV} must use a direct TCP endpoint, not a Unix socket.`)
  }
  if (target.database === "") {
    fail(`${STAGING_DATABASE_URL_ENV} has no database name.`)
  }
  if (target.user === "") {
    fail(`${STAGING_DATABASE_URL_ENV} has no user name.`)
  }
  if (target.host === "") {
    fail(`${STAGING_DATABASE_URL_ENV} has no host name.`)
  }

  const host = stagingHost(target.host)
  if (host === "") {
    fail(`${STAGING_DATABASE_URL_ENV} has no host name.`)
  }
  if (isLoopbackOrUnspecifiedHost(host)) {
    fail(`the staging target is a loopback or unspecified host (${host}); use the Neon staging project.`)
  }
  if (isPooledStagingHost(host) || target.pooled) {
    fail(`the staging target uses a pooled endpoint (${host}); use the direct, unpooled endpoint.`)
  }
  if (target.port !== STAGING_PORT) {
    fail(`the staging target uses port ${target.port}; the direct staging endpoint is port ${STAGING_PORT}.`)
  }

  const url = parseStagingUrl(raw)

  const keys = [...url.searchParams.keys()]
  const duplicated = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))]
  if (duplicated.length > 0) {
    fail(`the staging URL carries duplicate connection parameters (${duplicated.join(", ")}).`)
  }

  const unexpected = keys.filter((key) => !ALLOWED_QUERY_PARAMS.has(key))
  if (unexpected.length > 0) {
    fail(`the staging URL carries unexpected connection parameters (${unexpected.join(", ")}).`)
  }

  const sslmode = (url.searchParams.get("sslmode") ?? "").trim().toLowerCase()
  if (!STAGING_TLS_MODES.has(sslmode)) {
    fail(
      `the staging URL must carry sslmode=require or stronger (observed: ${sslmode === "" ? "absent" : sslmode}).`,
    )
  }

  const forbiddenProductionHost = productionHost(env)
  if (host === forbiddenProductionHost) {
    fail(`the staging target host matches PRODUCTION_DATABASE_HOST (${forbiddenProductionHost}); use the staging project endpoint.`)
  }

  if (args.confirmHost.trim().toLowerCase() !== host) {
    fail("--confirm-host does not match the staging target host.")
  }
  if (args.confirmPort.trim() !== target.port) {
    fail("--confirm-port does not match the staging target port.")
  }
  if (args.confirmDatabase.trim() !== target.database) {
    fail("--confirm-database does not match the staging target database.")
  }

  return {
    raw,
    host,
    port: target.port,
    database: target.database,
    user: target.user,
    display: `${host}:${target.port}/${target.database}`,
  }
}
