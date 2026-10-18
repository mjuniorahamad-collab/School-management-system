import { describe, expect, it, vi } from "vitest"
import { assertWorkerDatabaseUrl } from "./helpers/verify-worker-db-url.js"

// DB-free unit contract for the worker database-URL guard.
//
// The guard is a speed bump in front of the destructive integration suites: if
// the worker's injected DATABASE_URL ever diverges from TEST_DATABASE_URL, the
// run must abort before any test file imports a Prisma client. These cases are
// pure object handling — no database, no network.

describe("assertWorkerDatabaseUrl", () => {
  it("does nothing when TEST_DATABASE_URL is unset or blank", () => {
    expect(() => assertWorkerDatabaseUrl({})).not.toThrow()
    expect(() => assertWorkerDatabaseUrl({ TEST_DATABASE_URL: "" })).not.toThrow()
    expect(() => assertWorkerDatabaseUrl({ TEST_DATABASE_URL: "   " })).not.toThrow()
  })

  it("allows an exact match between DATABASE_URL and TEST_DATABASE_URL", () => {
    const url = "postgresql://school:school@127.0.0.1:5433/school_management_test"
    expect(() =>
      assertWorkerDatabaseUrl({ TEST_DATABASE_URL: url, DATABASE_URL: url }),
    ).not.toThrow()
  })

  it("throws when DATABASE_URL is missing while TEST_DATABASE_URL is set", () => {
    expect(() =>
      assertWorkerDatabaseUrl({ TEST_DATABASE_URL: "postgresql://u@localhost/db_test" }),
    ).toThrow(/does not match TEST_DATABASE_URL/)
  })

  it("throws when DATABASE_URL differs from TEST_DATABASE_URL", () => {
    expect(() =>
      assertWorkerDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://u@localhost/test_a",
        DATABASE_URL: "postgresql://u@localhost/other_b",
      }),
    ).toThrow(/does not match TEST_DATABASE_URL/)
  })

  it("does not treat a blank DATABASE_URL as matching a set TEST_DATABASE_URL", () => {
    expect(() =>
      assertWorkerDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://u@localhost/test_a",
        DATABASE_URL: "",
      }),
    ).toThrow(/does not match TEST_DATABASE_URL/)
  })

  it("never includes either connection string (or its credentials) in the error", () => {
    const testUrl = "postgresql://worker:sup3rsecret@127.0.0.1:5433/school_management_test"
    const dbUrl = "postgresql://worker:othersecret@127.0.0.1:5433/production"
    try {
      assertWorkerDatabaseUrl({ TEST_DATABASE_URL: testUrl, DATABASE_URL: dbUrl })
      expect.unreachable("should have thrown")
    } catch (error) {
      const message = (error as Error).message
      expect(message).not.toContain("sup3rsecret")
      expect(message).not.toContain("othersecret")
      expect(message).not.toContain(testUrl)
      expect(message).not.toContain(dbUrl)
    }
  })
})

// Regression guard for the original defect: the check used to live in an
// `export default function`, which Vitest `setupFiles` never calls. Importing
// the setup module must therefore execute the assertion as a side effect. This
// module has no Prisma import and opens no connection — it only reads env vars.
describe("verify-worker-db-url.setup.ts import-time behaviour", () => {
  it("throws while importing when DATABASE_URL does not match TEST_DATABASE_URL", async () => {
    const previousTest = process.env.TEST_DATABASE_URL
    const previousDatabase = process.env.DATABASE_URL
    process.env.TEST_DATABASE_URL = "postgresql://u@localhost/test_a"
    process.env.DATABASE_URL = "postgresql://u@localhost/other_b"
    try {
      vi.resetModules()
      await expect(import("./helpers/verify-worker-db-url.setup.js")).rejects.toThrow(
        /does not match TEST_DATABASE_URL/,
      )
    } finally {
      if (previousTest === undefined) delete process.env.TEST_DATABASE_URL
      else process.env.TEST_DATABASE_URL = previousTest
      if (previousDatabase === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousDatabase
      vi.resetModules()
    }
  })

  it("imports cleanly when TEST_DATABASE_URL is unset", async () => {
    const previousTest = process.env.TEST_DATABASE_URL
    const previousDatabase = process.env.DATABASE_URL
    delete process.env.TEST_DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      vi.resetModules()
      await expect(
        import("./helpers/verify-worker-db-url.setup.js"),
      ).resolves.toBeDefined()
    } finally {
      if (previousTest === undefined) delete process.env.TEST_DATABASE_URL
      else process.env.TEST_DATABASE_URL = previousTest
      if (previousDatabase === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousDatabase
      vi.resetModules()
    }
  })
})
