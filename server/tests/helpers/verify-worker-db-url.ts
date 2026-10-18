// Pure, unit-testable core of the worker database-URL consistency check.
//
// Vitest `setupFiles` imports a module but IGNORES its exports, so the check
// cannot live in an exported function that Vitest is expected to call. It must
// run as a module-level side effect; see `verify-worker-db-url.setup.ts`, which
// calls this function at import time. Keeping the logic in its own module lets
// it be unit tested directly without triggering that import-time side effect.
//
// The check protects the destructive DB-backed integration suites: Vitest
// injects `DATABASE_URL` into each worker from the config's `integrationEnv`.
// If that ever diverges from the `TEST_DATABASE_URL` the main-process guard and
// identity probe validated, a worker could open a client against an unvetted
// database. Mismatch fails closed; no connection string is ever printed.

/**
 * Throws unless the worker's `DATABASE_URL` exactly matches `TEST_DATABASE_URL`.
 *
 * An unset (or blank) `TEST_DATABASE_URL` means the DB-free default, so the
 * check is a no-op. When it is set, `DATABASE_URL` must be present and equal to
 * it; otherwise the run aborts before any test file is imported.
 */
export function assertWorkerDatabaseUrl(env: Record<string, string | undefined>): void {
  const testUrl = env.TEST_DATABASE_URL
  if (testUrl === undefined || testUrl.trim() === "") {
    return
  }
  if (env.DATABASE_URL !== testUrl) {
    throw new Error(
      "DATABASE_URL injected into the test worker does not match TEST_DATABASE_URL. " +
        "Refusing to run the DB-backed integration suites with a mismatched connection " +
        "string. Connection strings are intentionally not printed.",
    )
  }
}
