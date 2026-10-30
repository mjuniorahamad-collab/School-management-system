import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Source contract for the integration suites' self-gating.
//
// assertSafeTestDatabaseUrl stops a destructive run, but only for suites that
// actually reach the database. A suite that opens a Prisma client without the
// `describe.skipIf(!TEST_DATABASE_URL)` gate would run whenever a developer has
// any TEST_DATABASE_URL set — including one this guard has just refused to
// validate — so the gate is what makes "the DB-free suite is the default" true.
//
// That gate is a single line copied into each file, so it is exactly the kind of
// thing a new suite omits and nobody notices until it wipes something. This
// suite reads each file as text and fails the build when a file that can reach
// the database is not gated.
//
// JSDOM cannot be used here and the assertions are deliberately textual, in the
// same spirit as print-foundation.test.ts.

const testsDir = import.meta.dirname

const suiteFiles = readdirSync(testsDir).filter((name) => name.endsWith(".integration.test.ts"))

interface Suite {
  name: string
  source: string
  reachesDatabase: boolean
  isGated: boolean
}

const suites: Suite[] = suiteFiles.map((name) => {
  const source = readFileSync(path.resolve(testsDir, name), "utf8")
  return {
    name,
    source,
    // A suite reaches the database if it opens a client itself or asks the
    // shared reset helper to truncate it. Migrations now run once in globalSetup.
    reachesDatabase: source.includes("new PrismaClient()") || source.includes("resetTestDatabase"),
    isGated: source.includes("skipIf(!TEST_DATABASE_URL)"),
  }
})

const unguarded = suites.filter((suite) => suite.reachesDatabase && !suite.isGated)

/**
 * Integration suites that deliberately run without TEST_DATABASE_URL. Both are
 * reviewed as genuinely DB-free: app.integration exercises auth guards over
 * HTTP, and health-http.integration mocks server/src/lib/database.js. Anything
 * new that is not gated has to be added here deliberately, which is the point.
 */
const ALLOWED_UNGATED = ["app.integration.test.ts", "health-http.integration.test.ts"]

const ungatedNames = suites
  .filter((suite) => !suite.isGated)
  .map((suite) => suite.name)
  .sort()

describe("integration suite self-gating", () => {
  it("finds the integration suites", () => {
    // A glob change that silently matched nothing would make the rest vacuous.
    expect(suites.length).toBeGreaterThan(0)
  })

  it("gates every suite that opens a database client or migrates", () => {
    // The message names the offending files so the fix is obvious: either add the
    // gate, or confirm the suite genuinely needs no database.
    expect(
      unguarded.map((suite) => `${suite.name} (constructs a Prisma client but is not gated)`),
    ).toEqual([])
  })

  it("requires every ungated suite to be a reviewed allowlist entry", () => {
    // Opening a client is not the only way to reach the database — a suite can
    // connect through the app under test, which resolves DATABASE_URL from the
    // process env. Rather than guess which suites do that, any suite that is not
    // gated must be on the allowlist, so a new one forces a deliberate decision.
    const unexpected = ungatedNames.filter((name) => !ALLOWED_UNGATED.includes(name))
    expect(unexpected).toEqual([])
  })

  it("keeps the allowlist honest", () => {
    // Each entry is asserted to be DB-free, so the allowlist cannot quietly grow
    // to cover a suite that does destructive work.
    for (const name of ALLOWED_UNGATED) {
      const suite = suites.find((candidate) => candidate.name === name)
      expect(suite, `${name} is allowlisted but no longer exists`).toBeDefined()
      expect(suite?.reachesDatabase, `${name} is allowlisted but reaches the database`).toBe(false)
    }
  })

  it("keeps the health integration suite gated", () => {
    // health.integration.test.ts reaches the database through the app under test
    // rather than its own client, so it is invisible to the client check above.
    // This is the case that makes the allowlist necessary; keep it pinned.
    const suite = suites.find((candidate) => candidate.name === "health.integration.test.ts")
    expect(suite?.isGated).toBe(true)
  })

  it("never runs migrations or truncates outside the shared reset helper", () => {
    for (const suite of suites) {
      expect(suite.source, `${suite.name} invokes a migration`).not.toMatch(
        /\b(?:execFileSync|migrate\s+(?:deploy|dev))\b/,
      )
      expect(suite.source, `${suite.name} truncates tables directly`).not.toContain(
        "TRUNCATE TABLE",
      )
    }

    const helper = readFileSync(
      path.resolve(testsDir, "helpers/reset-test-database.ts"),
      "utf8",
    )
    expect(helper).toContain('TRUNCATE TABLE "School" CASCADE')
    expect(helper).toContain("$transaction")
    expect(helper).toContain("assertRuntimeDatabaseIdentity")
  })

  it("returns from global setup before opening Prisma when the test URL is unset", () => {
    const src = readFileSync(
      path.resolve(testsDir, "helpers/test-database-identity.global-setup.ts"),
      "utf8",
    )
    const guardIndex = src.indexOf("if (rawUrl === undefined")
    const prismaIndex = src.indexOf("new PrismaClient")
    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(prismaIndex).toBeGreaterThan(guardIndex)
  })
})

describe("vitest config safeguards", () => {
  function readConfig(relative: string): string {
    const full = path.resolve(process.cwd(), relative)
    return readFileSync(full, "utf8")
  }

  it("registers globalSetup and setupFiles in vitest.config.ts", () => {
    const src = readConfig("vitest.config.ts")
    expect(src).toContain("test-database-identity.global-setup.ts")
    expect(src).toContain("verify-worker-db-url.setup.ts")
    expect(src).toMatch(/globalSetup:\s*\[/)
    expect(src).toMatch(/setupFiles:\s*\[/)
  })

  it("registers globalSetup and setupFiles in vitest.timezone.config.ts", () => {
    const src = readConfig("vitest.timezone.config.ts")
    expect(src).toContain("test-database-identity.global-setup.ts")
    expect(src).toContain("verify-worker-db-url.setup.ts")
    expect(src).toMatch(/globalSetup:\s*\[/)
    expect(src).toMatch(/setupFiles:\s*\[/)
  })

  it("forwards the remote test identity to workers for re-validation", () => {
    for (const relative of ["vitest.config.ts", "vitest.timezone.config.ts"]) {
      expect(readConfig(relative), `${relative} must build worker env`).toContain(
        "buildIntegrationEnv",
      )
    }
    const helper = readConfig("server/tests/helpers/test-database-env.ts")
    for (const key of [
      "ALLOW_REMOTE_TEST_DATABASE",
      "EXPECTED_TEST_DATABASE_HOST",
      "EXPECTED_TEST_DATABASE_NAME",
      "EXPECTED_TEST_DATABASE_USER",
      "PRODUCTION_DATABASE_HOST",
      "PRODUCTION_DATABASE_NAME",
    ]) {
      expect(helper, `worker env must forward ${key}`).toContain(`"${key}"`)
    }
  })

  // The original bug this guards against: the worker check was written as an
  // `export default function`, and Vitest `setupFiles` ignores exports — so the
  // assertion never ran. Registering the filename is not enough; the check has
  // to execute as a module-level side effect when Vitest imports the file.
  it("runs the worker URL check as an import-time side effect, not an export", () => {
    const src = readConfig("server/tests/helpers/verify-worker-db-url.setup.ts")
    expect(src, "setupFiles ignore default exports; do not use one").not.toMatch(
      /export\s+default/,
    )
    expect(src, "the assertion must be invoked at module scope").toMatch(
      /assertWorkerDatabaseUrl\(\s*process\.env\s*\)/,
    )
  })
})

describe("operational script safeguards", () => {
  function readRepoFile(relative: string): string {
    return readFileSync(path.resolve(process.cwd(), relative), "utf8")
  }

  it("keeps restore scripts environment-only, direct-endpoint capable and single-transaction", () => {
    for (const relative of ["scripts/db-restore.ps1", "scripts/db-restore.sh"]) {
      const src = readRepoFile(relative)
      expect(src, `${relative} reads .env`).not.toMatch(/repoRoot\\\.env|ROOT\/\.env|resolve_env_value/)
      expect(src, `${relative} must accept RESTORE_DATABASE_URL`).toContain("RESTORE_DATABASE_URL")
      expect(src, `${relative} must use a single transaction`).toContain("--single-transaction")
      expect(src, `${relative} must support validate-only`).toMatch(/ValidateOnly|validate-only/)
      expect(src, `${relative} must not use --file for the input dump`).not.toMatch(
        /--file|"-file"|\$File"\)/,
      )
    }
    expect(readRepoFile("scripts/db-restore.ps1")).toContain("[string]::IsNullOrEmpty($ConfirmHost)")
    expect(readRepoFile("scripts/db-restore.sh")).toContain("[ -t 0 ]")
  })

  it("routes migrations through the guarded wrapper and keeps dev migrations local", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts["db:migrate"]).toBe(
      "tsx server/src/scripts/guarded-migrate.ts deploy",
    )
    expect(packageJson.scripts["db:migrate:dev"]).toBe(
      "tsx server/src/scripts/guarded-migrate.ts dev",
    )
    expect(packageJson.scripts["db:migrate:runtime"]).toBe(
      "node server/dist/scripts/guarded-migrate.js deploy",
    )
    expect(packageJson.scripts["db:seed"]).toBe("tsx server/prisma/seed.ts")

    const wrapper = readRepoFile("server/src/scripts/guarded-migrate.ts")
    expect(wrapper).toContain("resolveMigrationExecutionTarget")
    expect(wrapper).toContain("assertRemoteApprovals")
    expect(wrapper).not.toContain("accept-data-loss")
  })

  it("runs a DB-free test pass and the restore behavior tests in CI", () => {
    const ci = readRepoFile(".github/workflows/ci.yml")
    expect(ci).toMatch(/name:\s*Test \(DB-free\)/)
    expect(ci).toContain('TEST_DATABASE_URL: ""')
    expect(ci).toContain("bash scripts/tests/db-restore.sh")
    expect(ci).toContain("pwsh -NoProfile -File scripts/tests/db-restore.ps1")
    expect(ci).toContain("npm run test:tz")
  })
})
