import { describe, expect, it } from "vitest"
import {
  assertSafeTestDatabaseUrl,
  isDisposableTestDatabase,
  isLoopbackHost,
  redactDatabaseUrl,
} from "./helpers/test-database-guard.js"

// DB-free unit contract for the TEST_DATABASE_URL guard.
//
// The integration suites wipe the database they are pointed at, so the only thing
// standing between a misconfigured .env and a deleted production dataset is
// assertSafeTestDatabaseUrl. These cases are pure string handling: no database,
// no network, and no way for this suite to reach either.

const LOCAL_OK = "postgresql://school:school@127.0.0.1:5433/school_management_test"

describe("isLoopbackHost", () => {
  it("accepts the whole 127.0.0.0/8 range", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true)
    expect(isLoopbackHost("127.0.0.5")).toBe(true)
    expect(isLoopbackHost("127.255.255.254")).toBe(true)
  })

  it("accepts loopback hostnames case-insensitively", () => {
    expect(isLoopbackHost("localhost")).toBe(true)
    expect(isLoopbackHost("LocalHost")).toBe(true)
  })

  it("accepts both spellings of the IPv6 loopback", () => {
    // new URL() keeps the brackets on an IPv6 host, so they arrive as "[::1]".
    expect(isLoopbackHost("[::1]")).toBe(true)
    expect(isLoopbackHost("::1")).toBe(true)
    expect(isLoopbackHost("0:0:0:0:0:0:0:1")).toBe(true)
  })

  it("rejects remote and non-loopback addresses", () => {
    expect(isLoopbackHost("ep-sweet-boat.neon.tech")).toBe(false)
    expect(isLoopbackHost("db")).toBe(false)
    expect(isLoopbackHost("192.0.2.1")).toBe(false)
    expect(isLoopbackHost("10.0.0.5")).toBe(false)
    expect(isLoopbackHost("")).toBe(false)
  })

  it("does not accept a lookalike prefix of the loopback range", () => {
    expect(isLoopbackHost("127.0.0.1.evil.example")).toBe(false)
    expect(isLoopbackHost("localhost.evil.example")).toBe(false)
  })
})

describe("isDisposableTestDatabase", () => {
  it("accepts names that identify themselves as test databases", () => {
    expect(isDisposableTestDatabase("school_management_test")).toBe(true)
    expect(isDisposableTestDatabase("SMTP_TEST")).toBe(true)
    expect(isDisposableTestDatabase("test_school")).toBe(true)
  })

  it("rejects names without a test marker", () => {
    expect(isDisposableTestDatabase("neondb")).toBe(false)
    expect(isDisposableTestDatabase("school_management")).toBe(false)
    expect(isDisposableTestDatabase("")).toBe(false)
  })
})

describe("redactDatabaseUrl", () => {
  it("removes the password while keeping the target identifiable", () => {
    const redacted = redactDatabaseUrl(LOCAL_OK)
    expect(redacted).not.toContain("school:school@")
    expect(redacted).toContain("***")
    expect(redacted).toContain("127.0.0.1:5433")
    expect(redacted).toContain("school_management_test")
  })

  it("does not throw on an unparseable value", () => {
    expect(redactDatabaseUrl("not-a-url")).toBe("<unparseable database URL>")
  })
})

describe("assertSafeTestDatabaseUrl", () => {
  it("allows an unset value so the DB-free default still works", () => {
    expect(() => assertSafeTestDatabaseUrl(undefined)).not.toThrow()
    expect(() => assertSafeTestDatabaseUrl("")).not.toThrow()
    expect(() => assertSafeTestDatabaseUrl("   ")).not.toThrow()
  })

  it("allows the loopback test database this repository documents", () => {
    expect(() => assertSafeTestDatabaseUrl(LOCAL_OK)).not.toThrow()
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://school@localhost:5432/school_management_test"),
    ).not.toThrow()
  })

  it("allows a Unix-socket target", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql:///school_management_test?host=/var/run/postgresql"),
    ).not.toThrow()
  })

  it("refuses a remote host without the opt-in", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@ep-sweet-boat.neon.tech/neondb_test"),
    ).toThrow(/remote host/i)
  })

  it("refuses a local database whose name does not say test", () => {
    // A loopback host is not on its own enough: a developer pointing this at the
    // database in their .env would lose it.
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://school:school@localhost:5432/school_management"),
    ).toThrow(/disposable test database/i)
  })

  it("refuses a remote database with a production name even when opted in", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@ep-sweet-boat.neon.tech/neondb", {
        ALLOW_REMOTE_TEST_DATABASE: "1",
      }),
    ).toThrow(/disposable test database/i)
  })

  it("allows a remote test database once explicitly opted in", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@db:5432/school_management_test", {
        ALLOW_REMOTE_TEST_DATABASE: "1",
      }),
    ).not.toThrow()
  })

  it("treats an unrecognised opt-in value as not opted in", () => {
    // A typo must fail closed, never open.
    for (const value of ["y", "0", "false", "no", "please", ""]) {
      expect(() =>
        assertSafeTestDatabaseUrl("postgresql://u:p@db:5432/school_management_test", {
          ALLOW_REMOTE_TEST_DATABASE: value,
        }),
      ).toThrow(/remote host/i)
    }
  })

  it("accepts the documented opt-in spellings", () => {
    for (const value of ["1", "true", "TRUE", " yes "]) {
      expect(() =>
        assertSafeTestDatabaseUrl("postgresql://u:p@db:5432/school_management_test", {
          ALLOW_REMOTE_TEST_DATABASE: value,
        }),
      ).not.toThrow()
    }
  })

  it("refuses an unparseable value rather than assuming it is safe", () => {
    expect(() => assertSafeTestDatabaseUrl("school_management_test")).toThrow(
      /not a parseable connection string/i,
    )
  })

  it("never puts the password in a thrown message", () => {
    try {
      assertSafeTestDatabaseUrl("postgresql://school:hunter2@ep-sweet-boat.neon.tech/neondb")
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2")
      expect((error as Error).message).toContain("ep-sweet-boat.neon.tech")
    }
  })
})
