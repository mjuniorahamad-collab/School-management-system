import { describe, expect, it } from "vitest"
import {
  assertDirectDatabaseUrl,
  canonicalizeHost,
  databaseTargetsEquivalent,
  isLocalDatabaseTarget,
  isPooledHost,
  isProductionEquivalent,
  parseDatabaseTarget,
  readProductionIdentity,
  redactDatabaseUrl,
} from "../src/lib/database-target.js"

const DIRECT = "postgresql://school:secret@127.0.0.1:5433/school_management_test"
const NEON_DIRECT = "postgresql://school:secret@ep-quiet-lab.neon.tech/neondb?sslmode=require"
const NEON_POOLED = "postgresql://school:secret@ep-quiet-lab-pooler.neon.tech/neondb?sslmode=require"

describe("canonicalizeHost", () => {
  it("lowercases and trims direct hosts", () => {
    expect(canonicalizeHost("  EP-Quiet-Lab.Neon.Tech  ")).toBe("ep-quiet-lab.neon.tech")
  })

  it("removes exactly one Neon pooler suffix", () => {
    expect(canonicalizeHost("ep-quiet-lab-pooler.neon.tech")).toBe("ep-quiet-lab.neon.tech")
  })

  it("rejects a double pooler suffix instead of guessing", () => {
    expect(() => canonicalizeHost("ep-quiet-lab-pooler-pooler.neon.tech")).toThrow(
      /Ambiguous Neon pooled host/i,
    )
  })

  it("rejects non-Neon pooler hosts", () => {
    expect(() => canonicalizeHost("db-pooler.example.com")).toThrow(
      /Unsupported pooled database host/i,
    )
  })

  it("rejects unsupported host characters", () => {
    expect(() => canonicalizeHost("ep-quiet-lab.neon.tech/subpath")).toThrow(
      /Unsupported database host/i,
    )
  })
})

describe("isPooledHost", () => {
  it("detects a pooler label", () => {
    expect(isPooledHost("ep-quiet-lab-pooler.neon.tech")).toBe(true)
    expect(isPooledHost("ep-quiet-lab.neon.tech")).toBe(false)
  })
})

describe("parseDatabaseTarget", () => {
  it("parses a direct PostgreSQL URL and defaults the port", () => {
    const target = parseDatabaseTarget("postgresql://school:pw@ep-quiet-lab.neon.tech/neondb")
    expect(target).not.toBeNull()
    expect(target?.host).toBe("ep-quiet-lab.neon.tech")
    expect(target?.port).toBe("5432")
    expect(target?.database).toBe("neondb")
    expect(target?.user).toBe("school")
    expect(target?.pooled).toBe(false)
    expect(target?.socket).toBe(false)
  })

  it("marks pgbouncer query parameters as pooled", () => {
    const target = parseDatabaseTarget(`${NEON_DIRECT}&pgbouncer=true`)
    expect(target?.pooled).toBe(true)
  })

  it("parses Unix-socket URLs", () => {
    const target = parseDatabaseTarget("postgresql:///school_management_test?host=/var/run/postgresql")
    expect(target?.socket).toBe(true)
    expect(target?.socketPath).toBe("/var/run/postgresql")
    expect(target?.database).toBe("school_management_test")
  })

  it("rejects non-PostgreSQL URLs", () => {
    expect(parseDatabaseTarget("https://example.com/db")).toBeNull()
    expect(parseDatabaseTarget("not a URL")).toBeNull()
  })
})

describe("assertDirectDatabaseUrl", () => {
  it("accepts direct URLs, loopback URLs and Unix sockets", () => {
    expect(assertDirectDatabaseUrl(DIRECT, "testing").host).toBe("127.0.0.1")
    expect(assertDirectDatabaseUrl(NEON_DIRECT, "testing").host).toBe("ep-quiet-lab.neon.tech")
    expect(
      assertDirectDatabaseUrl("postgresql:///school_management_test?host=/var/run/postgresql", "testing")
        .socket,
    ).toBe(true)
  })

  it("rejects pooled endpoints and pgbouncer parameters", () => {
    expect(() => assertDirectDatabaseUrl(NEON_POOLED, "testing")).toThrow(/pooled endpoint/i)
    expect(() => assertDirectDatabaseUrl(`${NEON_DIRECT}&pgbouncer=true`, "testing")).toThrow(
      /pooled endpoint/i,
    )
  })

  it("rejects URLs without a database name or host", () => {
    expect(() => assertDirectDatabaseUrl("postgresql://school@127.0.0.1:5432/", "testing")).toThrow(
      /no database name/i,
    )
    expect(() => assertDirectDatabaseUrl("postgresql:///school_management_test", "testing")).toThrow(
      /no hostname/i,
    )
  })
})

describe("readProductionIdentity", () => {
  it("requires both values", () => {
    expect(() => readProductionIdentity({})).toThrow(/PRODUCTION_DATABASE_HOST is required/i)
    expect(() =>
      readProductionIdentity({ PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech" }),
    ).toThrow(/PRODUCTION_DATABASE_NAME is required/i)
  })

  it("rejects URLs, credentials and unsupported names", () => {
    expect(() =>
      readProductionIdentity({
        PRODUCTION_DATABASE_HOST: "postgresql://ep-prod.neon.tech",
        PRODUCTION_DATABASE_NAME: "neondb",
      }),
    ).toThrow(/host name, never a URL/i)
    expect(() =>
      readProductionIdentity({
        PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
        PRODUCTION_DATABASE_NAME: "neon db",
      }),
    ).toThrow(/unsupported characters/i)
  })

  it("returns a canonical host and lower-case database", () => {
    expect(
      readProductionIdentity({
        PRODUCTION_DATABASE_HOST: "EP-PROD.NEON.TECH",
        PRODUCTION_DATABASE_NAME: "NeonDB",
      }),
    ).toEqual({ host: "ep-prod.neon.tech", database: "neondb" })
  })
})

describe("target classification", () => {
  it("treats loopback and socket targets as local", () => {
    expect(isLocalDatabaseTarget(parseDatabaseTarget(DIRECT)!)).toBe(true)
    expect(
      isLocalDatabaseTarget(
        parseDatabaseTarget("postgresql:///school_management_test?host=/var/run/postgresql")!,
      ),
    ).toBe(true)
    expect(isLocalDatabaseTarget(parseDatabaseTarget(NEON_DIRECT)!)).toBe(false)
  })

  it("matches a pooled app URL to its direct execution URL", () => {
    expect(
      databaseTargetsEquivalent(
        parseDatabaseTarget(NEON_POOLED)!,
        parseDatabaseTarget(NEON_DIRECT)!,
      ),
    ).toBe(true)
  })

  it("does not match different databases, hosts or ports", () => {
    expect(
      databaseTargetsEquivalent(
        parseDatabaseTarget(NEON_DIRECT)!,
        parseDatabaseTarget("postgresql://school:pw@ep-quiet-lab.neon.tech/other")!,
      ),
    ).toBe(false)
    expect(
      databaseTargetsEquivalent(
        parseDatabaseTarget(NEON_DIRECT)!,
        parseDatabaseTarget("postgresql://school:pw@ep-other.neon.tech/neondb")!,
      ),
    ).toBe(false)
  })

  it("requires socket targets to use the same socket path", () => {
    const target = parseDatabaseTarget(
      "postgresql:///school_management_test?host=/var/run/postgresql",
    )!
    expect(
      databaseTargetsEquivalent(
        target,
        parseDatabaseTarget("postgresql:///school_management_test?host=/var/run/postgresql")!,
      ),
    ).toBe(true)
    expect(
      databaseTargetsEquivalent(
        target,
        parseDatabaseTarget("postgresql:///school_management_test?host=/tmp/postgresql")!,
      ),
    ).toBe(false)
  })

  it("does not consider sockets production-equivalent", () => {
    const production = readProductionIdentity({
      PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
      PRODUCTION_DATABASE_NAME: "neondb",
    })
    expect(
      isProductionEquivalent(parseDatabaseTarget(NEON_DIRECT)!, production),
    ).toBe(false)
    expect(
      isProductionEquivalent(
        parseDatabaseTarget("postgresql:///neondb?host=/var/run/postgresql")!,
        production,
      ),
    ).toBe(false)
  })
})

describe("redactDatabaseUrl", () => {
  it("removes passwords but keeps identity visible", () => {
    const redacted = redactDatabaseUrl(NEON_DIRECT)
    expect(redacted).toContain("ep-quiet-lab.neon.tech")
    expect(redacted).toContain("neondb")
    expect(redacted).not.toContain("secret")
    expect(redacted).toContain(":***@")
  })

  it("redacts sensitive query parameters", () => {
    const redacted = redactDatabaseUrl(
      "postgresql://school:secret@ep-quiet-lab.neon.tech/neondb?sslmode=require&sslpassword=query-secret",
    )
    expect(redacted).toContain("sslpassword=***")
    expect(redacted).toContain("sslmode=require")
    expect(redacted).not.toContain("query-secret")
  })

  it("never echoes an unparseable value", () => {
    expect(redactDatabaseUrl("not a URL with secret")).toBe("<unparseable database URL>")
  })
})
