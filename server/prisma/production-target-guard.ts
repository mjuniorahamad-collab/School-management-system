// Fail-closed target identity check for reconcile-permissions.ts.
//
// That command writes to the production database by design, so before it opens
// a connection it must prove that DATABASE_URL is exactly the production
// endpoint: host equal to PRODUCTION_DATABASE_HOST, the production database
// name, the direct (unpooled) address, port 5432, the expected TLS parameters,
// and no shell-level connection overrides. Every failure message names the
// offending key or host only — never a credential, never a connection string.

import { isDisposableTestDatabase, isLoopbackHost } from "../tests/helpers/test-database-guard.js"

/** The production database name, part of the endpoint identity this command pins. */
export const PRODUCTION_DATABASE_NAME = "neondb"

const PRODUCTION_PORT = "5432"

const REQUIRED_PARAMS: Record<string, string> = {
  sslmode: "require",
  channel_binding: "require",
}

/** Connection parameters accepted on the production endpoint; everything else fails closed. */
const ALLOWED_PARAMS = new Set<string>([
  "sslmode",
  "channel_binding",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
  "connect_timeout",
  "application_name",
])

export interface ProductionTargetGuardInput {
  /** Environment captured before the repository .env was loaded, so shell overrides stay visible. */
  shellEnv: Record<string, string | undefined>
  databaseUrl: string | undefined
  testDatabaseUrl: string | undefined
  productionDatabaseHost: string | undefined
}

export interface ProductionTarget {
  host: string
  database: string
  port: string
  /** Connection string with user and password replaced — safe to print. */
  displayUrl: string
}

function fail(detail: string): never {
  throw new Error(`Refusing to reconcile permissions: ${detail}`)
}

export function displayTargetUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "<unparseable database URL>"
  }
  const hasCredentials = url.username !== "" || url.password !== ""
  const auth = hasCredentials ? "***:***@" : ""
  return `${url.protocol}//${auth}${url.host}${url.pathname}${url.search}`
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""))
}

export function assertProductionTarget(input: ProductionTargetGuardInput): ProductionTarget {
  const { shellEnv, databaseUrl, testDatabaseUrl, productionDatabaseHost } = input

  const shellOverrides = (["DATABASE_URL", "TEST_DATABASE_URL"] as const).filter((key) => {
    const value = shellEnv[key]
    return value !== undefined && value.trim() !== ""
  })
  if (shellOverrides.length > 0) {
    fail(
      `connection strings are set in the shell environment (${shellOverrides.join(", ")}); ` +
        "this command takes its target from the repository .env only — unset them and rerun.",
    )
  }

  const pgOverrides = Object.keys(shellEnv).filter((key) => /^PG[A-Z0-9_]*$/.test(key))
  if (pgOverrides.length > 0) {
    fail(`libpq environment overrides are set (${pgOverrides.join(", ")}); unset them before running this command.`)
  }

  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    fail("DATABASE_URL is not set; this command targets the production database and cannot run without it.")
  }

  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    fail("DATABASE_URL is not a parseable connection string.")
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail(`DATABASE_URL uses protocol ${url.protocol}; only postgres connection strings are accepted.`)
  }

  const unexpected = [...url.searchParams.keys()].filter((key) => !ALLOWED_PARAMS.has(key))
  if (unexpected.length > 0) {
    fail(
      `DATABASE_URL carries unexpected connection parameters (${unexpected.join(", ")}); ` +
        `the production endpoint allows only ${[...ALLOWED_PARAMS].join(", ")}.`,
    )
  }
  for (const [key, expected] of Object.entries(REQUIRED_PARAMS)) {
    const actual = url.searchParams.get(key)
    if (actual === null || actual.trim().toLowerCase() !== expected) {
      fail(`DATABASE_URL must carry ${key}=${expected} (observed: ${actual === null ? "absent" : actual}).`)
    }
  }

  const host = url.hostname.trim().toLowerCase()
  const productionHost = (productionDatabaseHost ?? "").trim().toLowerCase()

  if (host === "") fail("DATABASE_URL has no hostname.")
  if (productionHost === "") {
    fail("PRODUCTION_DATABASE_HOST is not set; the production endpoint host is required to verify the target.")
  }
  if (isLoopbackHost(host)) {
    fail(`DATABASE_URL points at the loopback host ${host}; this command reconciles the production database only.`)
  }
  if (host.includes("pooler")) {
    fail(`DATABASE_URL points at the pooled endpoint ${host}; use the direct, unpooled production endpoint.`)
  }
  if (host !== productionHost) {
    fail(`DATABASE_URL host (${host}) does not match PRODUCTION_DATABASE_HOST (${productionHost}).`)
  }

  const database = databaseName(url)
  if (database !== PRODUCTION_DATABASE_NAME) {
    fail(`DATABASE_URL names database "${database}" but the production database is "${PRODUCTION_DATABASE_NAME}".`)
  }

  const port = url.port === "" ? PRODUCTION_PORT : url.port
  if (port !== PRODUCTION_PORT) {
    fail(`DATABASE_URL uses port ${port}; the production endpoint is port ${PRODUCTION_PORT}.`)
  }

  if (testDatabaseUrl !== undefined && testDatabaseUrl.trim() !== "") {
    let testUrl: URL
    try {
      testUrl = new URL(testDatabaseUrl)
    } catch {
      fail("TEST_DATABASE_URL is set but is not a parseable connection string.")
    }
    const testHost = testUrl.hostname.trim().toLowerCase()
    const testDatabase = databaseName(testUrl)
    if (!isLoopbackHost(testHost)) {
      fail(`TEST_DATABASE_URL points at ${testHost === "" ? "<no host>" : testHost}; it must stay on a local, disposable database.`)
    }
    if (!isDisposableTestDatabase(testDatabase)) {
      fail(`TEST_DATABASE_URL names database "${testDatabase}" but must name a disposable test database (for example school_management_test).`)
    }
  }

  return { host, database, port, displayUrl: displayTargetUrl(databaseUrl) }
}
