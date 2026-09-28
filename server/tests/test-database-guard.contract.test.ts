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
    // A suite reaches the database if it opens a client itself or shells out to
    // `prisma migrate`; the HTTP app under test connects through the same
    // process-level DATABASE_URL, so a client check is the reliable signal.
    reachesDatabase: source.includes("new PrismaClient()") || source.includes("migrate"),
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
})
