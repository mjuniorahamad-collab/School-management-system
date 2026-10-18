// Pure, unit-testable helper for asserting runtime database identity.
//
// Compares the identity reported by the connected database against the
// declared test identity. All comparisons are case-insensitive. No
// network/database calls occur here; callers must perform the probe.
// Error messages only echo the already-redacted `displayUrl` plus database
// and role names, never credentials.
import { isLoopbackHost } from "./test-database-guard.js"

const TRUTHY = new Set(["1", "true", "yes"])

function readString(env: Record<string, string | undefined>, key: string): string | null {
  const raw = env[key]
  if (raw === undefined) return null
  const value = raw.trim()
  return value === "" ? null : value
}

function readHost(env: Record<string, string | undefined>, key: string): string | null {
  const raw = env[key]
  if (raw === undefined) return null
  const value = raw.trim().toLowerCase()
  return value === "" ? null : value
}

function isOptedIn(env: Record<string, string | undefined>): boolean {
  const raw = env.ALLOW_REMOTE_TEST_DATABASE
  if (raw === undefined) return false
  return TRUTHY.has(raw.trim().toLowerCase())
}

export interface RuntimeDatabaseIdentityOptions {
  /** Hostname from TEST_DATABASE_URL (lowercased, brackets stripped by caller convention) */
  urlHost: string
  /** Database name from TEST_DATABASE_URL */
  urlDatabase: string
  connected: {
    database: string
    user: string
  }
  env: Record<string, string | undefined>
  displayUrl: string
}

export function assertRuntimeDatabaseIdentity(opts: RuntimeDatabaseIdentityOptions): void {
  const { urlHost, urlDatabase, connected, env, displayUrl } = opts
  const host = urlHost.trim().toLowerCase()
  const local = isLoopbackHost(host) || host === "" // socket targets: host may be empty

  const connectedDb = (connected.database ?? "").trim().toLowerCase()
  const connectedUser = (connected.user ?? "").trim().toLowerCase()

  const expectedDb = readString(env, "EXPECTED_TEST_DATABASE_NAME")
  const expectedUser = readString(env, "EXPECTED_TEST_DATABASE_USER")
  const expectedHost = readHost(env, "EXPECTED_TEST_DATABASE_HOST")
  const productionHost = readHost(env, "PRODUCTION_DATABASE_HOST")

  if (local && host === "") {
    // Unix socket: cannot validate host identity via hostname; rely on DB name/user if provided
    if (expectedDb !== null) {
      const exp = expectedDb.trim().toLowerCase()
      if (connectedDb !== exp) {
        throw new Error(
          `Refusing to run the DB-backed integration suites: connected database (${connectedDb}) ` +
            `does not match EXPECTED_TEST_DATABASE_NAME (${exp}). Target: ${displayUrl}`,
        )
      }
    } else {
      // fallback: must be disposable test db
      if (!urlDatabase.toLowerCase().includes("test") && !connectedDb.includes("test")) {
        throw new Error(
          `Refusing to run the DB-backed integration suites: TEST_DATABASE_URL does not name a ` +
            `disposable test database (${displayUrl}). A socket target must connect to a database ` +
            "whose name contains \"test\" or declare EXPECTED_TEST_DATABASE_NAME.",
        )
      }
    }
    if (expectedUser !== null) {
      const expUser = expectedUser.trim().toLowerCase()
      if (connectedUser !== expUser) {
        throw new Error(
          `Refusing to run the DB-backed integration suites: connected database user (${connectedUser}) ` +
            `does not match EXPECTED_TEST_DATABASE_USER (${expUser}). Target: ${displayUrl}`,
        )
      }
    }
    return
  }

  if (local) {
    // loopback: host identity not strictly required by guard, but still enforce consistency if vars set
    if (expectedHost !== null && host !== expectedHost) {
      throw new Error(
        "Refusing to run the DB-backed integration suites: the target " +
          `(${displayUrl}) does not match EXPECTED_TEST_DATABASE_HOST (${expectedHost}).`,
      )
    }
    if (productionHost !== null && host === productionHost) {
      throw new Error(
        "Refusing to run the DB-backed integration suites: the target " +
          `(${displayUrl}) is the production host. Refusing to touch it.`,
      )
    }
    if (expectedDb !== null) {
      const exp = expectedDb.trim().toLowerCase()
      if (connectedDb !== exp) {
        throw new Error(
          `Refusing to run the DB-backed integration suites: connected database (${connectedDb}) ` +
            `does not match EXPECTED_TEST_DATABASE_NAME (${exp}). Target: ${displayUrl}`,
        )
      }
    } else {
      // fallback to URL/connected name containing "test"
      if (!urlDatabase.toLowerCase().includes("test") && !connectedDb.includes("test")) {
        throw new Error(
          `Refusing to run the DB-backed integration suites: TEST_DATABASE_URL does not name a ` +
            `disposable test database (${displayUrl}). A loopback database name must contain "test".`,
        )
      }
    }
    if (expectedUser !== null) {
      const expUser = expectedUser.trim().toLowerCase()
      if (connectedUser !== expUser) {
        throw new Error(
          `Refusing to run the DB-backed integration suites: connected database user (${connectedUser}) ` +
            `does not match EXPECTED_TEST_DATABASE_USER (${expUser}). Target: ${displayUrl}`,
        )
      }
    }
    return
  }

  // remote
  if (!isOptedIn(env)) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${displayUrl}). Set ALLOW_REMOTE_TEST_DATABASE=1 and declare the expected identity.`,
    )
  }
  if (expectedHost === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${displayUrl}) but EXPECTED_TEST_DATABASE_HOST is not set.`,
    )
  }
  if (productionHost === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${displayUrl}) but PRODUCTION_DATABASE_HOST is not set.`,
    )
  }
  if (host === productionHost) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: the remote target " +
        `(${displayUrl}) is the production host. Refusing to touch it.`,
    )
  }
  if (expectedHost === productionHost) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: EXPECTED_TEST_DATABASE_HOST and " +
        "PRODUCTION_DATABASE_HOST are identical.",
    )
  }
  if (host !== expectedHost) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: the remote target " +
        `(${displayUrl}) does not match EXPECTED_TEST_DATABASE_HOST (${expectedHost}).`,
    )
  }
  if (expectedDb === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${displayUrl}) but EXPECTED_TEST_DATABASE_NAME is not set.`,
    )
  }
  if (expectedUser === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${displayUrl}) but EXPECTED_TEST_DATABASE_USER is not set.`,
    )
  }
  const expDb = expectedDb.trim().toLowerCase()
  const expUser = expectedUser.trim().toLowerCase()
  if (connectedDb !== expDb) {
    throw new Error(
      `Refusing to run the DB-backed integration suites: connected database (${connectedDb}) ` +
        `does not match EXPECTED_TEST_DATABASE_NAME (${expDb}). Target: ${displayUrl}`,
    )
  }
  if (connectedUser !== expUser) {
    throw new Error(
      `Refusing to run the DB-backed integration suites: connected database user (${connectedUser}) ` +
        `does not match EXPECTED_TEST_DATABASE_USER (${expUser}). Target: ${displayUrl}`,
    )
  }
}
