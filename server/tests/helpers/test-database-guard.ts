// Safety guard for TEST_DATABASE_URL, called once at vitest config load.
//
// The DB-backed integration suites are destructive by design: their `afterAll`
// runs unscoped `deleteMany()` across every core table (`school`, `user`,
// `permission`, `role`, `class`, `student`, …) rather than cleaning up only the
// rows they created. There is no transaction and no rollback, so that is safe
// only while TEST_DATABASE_URL points at a disposable database.
//
// Without this guard that safety rests entirely on a value in an uncommitted
// .env: pointing TEST_DATABASE_URL at a real database would empty it on the
// first run, and `describe.skipIf(!TEST_DATABASE_URL)` would happily proceed
// because the variable is set. The check is pure and side-effect free so it can
// be unit tested without a database or a network.
//
// It lives beside the suites it protects and is imported by vitest.config.ts
// with an explicit .ts extension: `resolve.extensionAlias` in that config
// applies to test modules, not to the config file itself, which Vite loads
// through its own bundler.

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const LOOPBACK_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"])
const LOOPBACK_IPV6 = new Set(["::1", "0:0:0:0:0:0:0:1"])
const TRUTHY = new Set(["1", "true", "yes"])

/**
 * True for hosts that can only reach this machine. Accepts 127.0.0/8, the
 * conventional loopback names, and both spellings of the IPv6 loopback.
 *
 * Note `new URL("postgres://u:p@[::1]:5432/db").hostname` returns `"[::1]"` with
 * the brackets intact, so they are stripped before comparison.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  if (host === "") return false
  if (LOOPBACK_IPV6.has(host)) return true
  if (LOOPBACK_HOSTNAMES.has(host)) return true
  return LOOPBACK_IPV4.test(host)
}

/**
 * True for a database name that identifies itself as throwaway.
 *
 * This is a convention check, not a proof. A production database that happened
 * to contain "test" in its name would pass it, which is why the loopback check
 * is applied as well: the realistic residual risk is losing a *local* database,
 * not a remote production one.
 */
export function isDisposableTestDatabase(dbName: string): boolean {
  return dbName.toLowerCase().includes("test")
}

/** Builds a display-safe copy of a connection string with the password removed. */
export function redactDatabaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "<unparseable database URL>"
  }
  const auth = url.username === "" ? "" : `${url.username}${url.password === "" ? "" : ":***"}@`
  return `${url.protocol}//${auth}${url.host}${url.pathname}${url.search}`
}

interface ParsedTarget {
  host: string
  database: string
  /** A Unix-socket target (`?host=/var/run/postgresql`) has no hostname at all. */
  socket: boolean
}

function parseTarget(raw: string): ParsedTarget | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  const hostParam = url.searchParams.get("host")
  const socket = url.hostname === "" && hostParam !== null && hostParam.startsWith("/")
  return { host: url.hostname, database, socket }
}

function isOptedIn(env: Record<string, string | undefined>): boolean {
  const raw = env.ALLOW_REMOTE_TEST_DATABASE
  if (raw === undefined) return false
  // Anything unrecognised counts as "not opted in": a typo must fail closed.
  return TRUTHY.has(raw.trim().toLowerCase())
}

/**
 * Throws unless TEST_DATABASE_URL names a database the integration suites are
 * allowed to destroy. An unset value is allowed and means "run the DB-free
 * suites only", which is the documented default.
 */
export function assertSafeTestDatabaseUrl(
  raw: string | undefined,
  env: Record<string, string | undefined> = process.env,
): void {
  if (raw === undefined || raw.trim() === "") return

  const target = parseTarget(raw)
  if (target === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL is not a parseable " +
        "connection string. The integration suites apply migrations and delete every row in the " +
        "target database, so this value must be verified before the run starts.",
    )
  }

  const display = redactDatabaseUrl(raw)
  const local = target.socket || isLoopbackHost(target.host)

  if (!local && !isOptedIn(env)) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL points at a remote " +
        `host (${display}). Those suites apply migrations and delete every row in the database they ` +
        "are pointed at, including tables this repository has no fixtures for. Point " +
        "TEST_DATABASE_URL at a local, disposable test database (see .env.example), or set " +
        "ALLOW_REMOTE_TEST_DATABASE=1 if this really is a throwaway remote database.",
    )
  }

  if (!isDisposableTestDatabase(target.database)) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL does not name a " +
        `disposable test database (${display}). A reachable database name must contain "test" so ` +
        "that a misconfiguration cannot delete real data. Point it at a database such as " +
        "school_management_test.",
    )
  }
}
