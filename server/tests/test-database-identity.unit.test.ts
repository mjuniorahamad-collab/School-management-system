import { describe, expect, it } from "vitest"
import { assertRuntimeDatabaseIdentity } from "./helpers/test-database-identity.js"
import { redactDatabaseUrl } from "./helpers/test-database-guard.js"

describe("assertRuntimeDatabaseIdentity", () => {
  const display = (url: string) => redactDatabaseUrl(url)

  it("allows loopback with matching identity when vars set", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "127.0.0.1",
        urlDatabase: "school_management_test",
        connected: { database: "school_management_test", user: "school" },
        env: {
          EXPECTED_TEST_DATABASE_NAME: "school_management_test",
          EXPECTED_TEST_DATABASE_USER: "school",
        },
        displayUrl: display("postgresql://school:school@127.0.0.1:5432/school_management_test"),
      }),
    ).not.toThrow()
  })

  it("allows loopback with case-insensitive matching", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "LOCALHOST",
        urlDatabase: "SCHOOL_MANAGEMENT_TEST",
        connected: { database: "school_management_test", user: "SCHOOL" },
        env: {
          EXPECTED_TEST_DATABASE_NAME: "School_Management_Test",
          EXPECTED_TEST_DATABASE_USER: "School",
        },
        displayUrl: display("postgresql://school@localhost:5432/school_management_test"),
      }),
    ).not.toThrow()
  })

  it("falls back to 'test' marker on loopback when vars unset", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "localhost",
        urlDatabase: "school_management_test",
        connected: { database: "school_management_test", user: "app_user" },
        env: {},
        displayUrl: display("postgresql://app@localhost:5432/school_management_test"),
      }),
    ).not.toThrow()
  })

  it("rejects loopback fallback when neither URL nor connected has 'test'", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "localhost",
        urlDatabase: "school_management",
        connected: { database: "school_management", user: "app" },
        env: {},
        displayUrl: display("postgresql://app@localhost:5432/school_management"),
      }),
    ).toThrow(/disposable test database/)
  })

  it("rejects loopback when connected db differs from expected", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "localhost",
        urlDatabase: "school_management_test",
        connected: { database: "other_test", user: "school" },
        env: {
          EXPECTED_TEST_DATABASE_NAME: "school_management_test",
          EXPECTED_TEST_DATABASE_USER: "school",
        },
        displayUrl: display("postgresql://school@localhost:5432/school_management_test"),
      }),
    ).toThrow(/does not match EXPECTED_TEST_DATABASE_NAME/)
  })

  it("rejects loopback when connected user differs from expected", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "localhost",
        urlDatabase: "school_management_test",
        connected: { database: "school_management_test", user: "other" },
        env: {
          EXPECTED_TEST_DATABASE_NAME: "school_management_test",
          EXPECTED_TEST_DATABASE_USER: "school",
        },
        displayUrl: display("postgresql://school@localhost:5432/school_management_test"),
      }),
    ).toThrow(/does not match EXPECTED_TEST_DATABASE_USER/)
  })

  it("handles socket target with expected vars", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "",
        urlDatabase: "school_management_test",
        connected: { database: "school_management_test", user: "school" },
        env: {
          EXPECTED_TEST_DATABASE_NAME: "school_management_test",
          EXPECTED_TEST_DATABASE_USER: "school",
        },
        displayUrl: display("postgresql:///school_management_test?host=/var/run/postgresql"),
      }),
    ).not.toThrow()
  })

  it("rejects socket when connected db differs", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "",
        urlDatabase: "school_management_test",
        connected: { database: "wrong", user: "school" },
        env: {
          EXPECTED_TEST_DATABASE_NAME: "school_management_test",
          EXPECTED_TEST_DATABASE_USER: "school",
        },
        displayUrl: display("postgresql:///school_management_test?host=/var/run/postgresql"),
      }),
    ).toThrow(/does not match EXPECTED_TEST_DATABASE_NAME/)
  })

  it("requires remote identity vars", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "ep-test.neon.tech",
        urlDatabase: "neondb",
        connected: { database: "neondb", user: "neondb_owner" },
        env: {
          ALLOW_REMOTE_TEST_DATABASE: "1",
          EXPECTED_TEST_DATABASE_HOST: "ep-test.neon.tech",
          PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
        },
        displayUrl: display("postgresql://u:p@ep-test.neon.tech/neondb"),
      }),
    ).toThrow(/EXPECTED_TEST_DATABASE_NAME/)
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "ep-test.neon.tech",
        urlDatabase: "neondb",
        connected: { database: "neondb", user: "neondb_owner" },
        env: {
          ALLOW_REMOTE_TEST_DATABASE: "1",
          EXPECTED_TEST_DATABASE_HOST: "ep-test.neon.tech",
          PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
          EXPECTED_TEST_DATABASE_NAME: "neondb",
        },
        displayUrl: display("postgresql://u:p@ep-test.neon.tech/neondb"),
      }),
    ).toThrow(/EXPECTED_TEST_DATABASE_USER/)
  })

  it("allows remote when all identity matches", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "ep-quiet-lab.neon.tech",
        urlDatabase: "neondb",
        connected: { database: "neondb", user: "neondb_owner" },
        env: {
          ALLOW_REMOTE_TEST_DATABASE: "1",
          EXPECTED_TEST_DATABASE_HOST: "ep-quiet-lab.neon.tech",
          PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
          EXPECTED_TEST_DATABASE_NAME: "neondb",
          EXPECTED_TEST_DATABASE_USER: "neondb_owner",
        },
        displayUrl: display("postgresql://u:p@ep-quiet-lab.neon.tech/neondb"),
      }),
    ).not.toThrow()
  })

  it("rejects remote when host mismatches", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "ep-other.neon.tech",
        urlDatabase: "neondb",
        connected: { database: "neondb", user: "neondb_owner" },
        env: {
          ALLOW_REMOTE_TEST_DATABASE: "1",
          EXPECTED_TEST_DATABASE_HOST: "ep-quiet-lab.neon.tech",
          PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
          EXPECTED_TEST_DATABASE_NAME: "neondb",
          EXPECTED_TEST_DATABASE_USER: "neondb_owner",
        },
        displayUrl: display("postgresql://u:p@ep-other.neon.tech/neondb"),
      }),
    ).toThrow(/does not match EXPECTED_TEST_DATABASE_HOST/)
  })

  it("rejects remote when database mismatches", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "ep-test.neon.tech",
        urlDatabase: "neondb",
        connected: { database: "wrongdb", user: "neondb_owner" },
        env: {
          ALLOW_REMOTE_TEST_DATABASE: "1",
          EXPECTED_TEST_DATABASE_HOST: "ep-test.neon.tech",
          PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
          EXPECTED_TEST_DATABASE_NAME: "neondb",
          EXPECTED_TEST_DATABASE_USER: "neondb_owner",
        },
        displayUrl: display("postgresql://u:p@ep-test.neon.tech/neondb"),
      }),
    ).toThrow(/does not match EXPECTED_TEST_DATABASE_NAME/)
  })

  it("rejects remote when user mismatches", () => {
    expect(() =>
      assertRuntimeDatabaseIdentity({
        urlHost: "ep-test.neon.tech",
        urlDatabase: "neondb",
        connected: { database: "neondb", user: "wronguser" },
        env: {
          ALLOW_REMOTE_TEST_DATABASE: "1",
          EXPECTED_TEST_DATABASE_HOST: "ep-test.neon.tech",
          PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
          EXPECTED_TEST_DATABASE_NAME: "neondb",
          EXPECTED_TEST_DATABASE_USER: "neondb_owner",
        },
        displayUrl: display("postgresql://u:p@ep-test.neon.tech/neondb"),
      }),
    ).toThrow(/does not match EXPECTED_TEST_DATABASE_USER/)
  })

  it("does not expose secrets in messages", () => {
    try {
      assertRuntimeDatabaseIdentity({
        urlHost: "ep-test.neon.tech",
        urlDatabase: "neondb",
        connected: { database: "neondb", user: "wrong" },
        env: {
          ALLOW_REMOTE_TEST_DATABASE: "1",
          EXPECTED_TEST_DATABASE_HOST: "ep-test.neon.tech",
          PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
          EXPECTED_TEST_DATABASE_NAME: "neondb",
          EXPECTED_TEST_DATABASE_USER: "neondb_owner",
        },
        displayUrl: display("postgresql://school:hunter2@ep-test.neon.tech/neondb"),
      })
      expect.unreachable("should have thrown")
    } catch (error) {
      const msg = (error as Error).message
      expect(msg).not.toContain("hunter2")
      expect(msg).toContain("ep-test.neon.tech")
    }
  })
})
