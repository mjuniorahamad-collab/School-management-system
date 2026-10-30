// Safety guard for TEST_DATABASE_URL, called once at vitest config load.
//
// The DB-backed integration suites are destructive by design. Without this
// guard that safety would rest entirely on an uncommitted .env value. The check
// is pure and side-effect free so it can be unit tested without a database.

import {
  canonicalizeHost,
  isDisposableTestDatabase,
  isLoopbackHost,
  parseDatabaseTarget,
  readProductionIdentity,
  redactDatabaseUrl,
} from "../../src/lib/database-target.js"

export { isDisposableTestDatabase, isLoopbackHost, redactDatabaseUrl }

const TRUTHY = new Set(["1", "true", "yes"])

function isOptedIn(env: Record<string, string | undefined>): boolean {
  const raw = env.ALLOW_REMOTE_TEST_DATABASE
  if (raw === undefined) return false
  return TRUTHY.has(raw.trim().toLowerCase())
}

function readHost(env: Record<string, string | undefined>, key: string): string | null {
  const raw = env[key]
  if (raw === undefined) return null
  const value = raw.trim()
  return value === "" ? null : canonicalizeHost(value)
}

export function assertSafeTestDatabaseUrl(
  raw: string | undefined,
  env: Record<string, string | undefined> = process.env,
): void {
  if (raw === undefined || raw.trim() === "") return

  const target = parseDatabaseTarget(raw)
  if (target === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL is not a parseable " +
        "connection string. The integration suites apply migrations and delete every " +
        "row in the target database, so this value must be verified before the run starts.",
    )
  }

  const display = target.displayUrl
  const local = target.socket || isLoopbackHost(target.host)

  if (local) {
    if (!isDisposableTestDatabase(target.database)) {
      throw new Error(
        "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL does not name a " +
          `disposable test database (${display}). A loopback database name must contain "test" so ` +
          "that a misconfiguration cannot delete real data. Point it at a database such as " +
          "school_management_test.",
      )
    }
    return
  }

  if (target.pooled) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a pooled " +
        `endpoint (${display}). Use the direct, unpooled test endpoint so migrations run correctly.`,
    )
  }

  const host = canonicalizeHost(target.host)

  if (!isOptedIn(env)) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${display}). Those suites apply migrations and delete every row in the database they ` +
        "are pointed at. Point TEST_DATABASE_URL at a local, disposable test database (see " +
        ".env.example), or set ALLOW_REMOTE_TEST_DATABASE=1 if this really is a throwaway remote database.",
    )
  }

  const expectedHost = readHost(env, "EXPECTED_TEST_DATABASE_HOST")
  if (expectedHost === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${display}) but EXPECTED_TEST_DATABASE_HOST is not set. A remote test target must ` +
        "declare the exact endpoint host of the independently created test database so the run can " +
        "prove it is the intended target.",
    )
  }

  const production = readProductionIdentity(env)
  if (host === production.host) {
    throw new Error(
      `Refusing to run the DB-backed integration suites: the remote target (${display}) is the ` +
        "production host. Refusing to touch it.",
    )
  }
  if (expectedHost === production.host) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: EXPECTED_TEST_DATABASE_HOST and " +
        "PRODUCTION_DATABASE_HOST are identical, so the test target cannot be distinguished from production.",
    )
  }
  if (host !== expectedHost) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: the remote target " +
        `(${display}) does not match EXPECTED_TEST_DATABASE_HOST (${expectedHost}). Point ` +
        "TEST_DATABASE_URL at the exact endpoint of the independently created test database.",
    )
  }
}
