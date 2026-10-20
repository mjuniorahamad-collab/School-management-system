import { describe, expect, it } from "vitest"
import {
  PRODUCTION_DATABASE_NAME,
  assertProductionTarget,
  displayTargetUrl,
  type ProductionTargetGuardInput,
} from "../prisma/production-target-guard.js"

// Fail-closed coverage for the target identity check that gates every
// reconciliation run. Each refusal also proves that no credential reaches the
// error message, so a failed run cannot leak the connection string into a log.

const HOST = "ep-sweet-boat-b1kevdey.c-5.eu-central-1.aws.neon.tech"
const USER = "neondb_owner"
const PASSWORD = "sup3rs3cr3t"

function urlFor(options: { host?: string; port?: string; database?: string; params?: string } = {}): string {
  const host = options.host ?? HOST
  const port = options.port ?? "5432"
  const database = options.database ?? PRODUCTION_DATABASE_NAME
  const params = options.params ?? "sslmode=require&channel_binding=require"
  const authority = port === "" ? host : `${host}:${port}`
  const query = params === "" ? "" : `?${params}`
  return `postgresql://${USER}:${PASSWORD}@${authority}/${database}${query}`
}

const PRODUCTION_URL = urlFor()
const TEST_URL = "postgresql://school@127.0.0.1:5433/school_management_test"

function input(overrides: Partial<ProductionTargetGuardInput> = {}): ProductionTargetGuardInput {
  return {
    shellEnv: {},
    databaseUrl: PRODUCTION_URL,
    testDatabaseUrl: TEST_URL,
    productionDatabaseHost: HOST,
    ...overrides,
  }
}

function refusal(candidate: ProductionTargetGuardInput): string {
  try {
    assertProductionTarget(candidate)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    expect(message).not.toContain(PASSWORD)
    expect(message).not.toContain(USER)
    expect(message).not.toContain("@")
    return message
  }
  throw new Error("expected the guard to refuse this target")
}

describe("assertProductionTarget", () => {
  it("accepts the pinned production endpoint and returns a printable target", () => {
    const target = assertProductionTarget(input())
    expect(target.host).toBe(HOST)
    expect(target.database).toBe(PRODUCTION_DATABASE_NAME)
    expect(target.port).toBe("5432")
    expect(target.displayUrl).toBe(`postgresql://***:***@${HOST}:5432/${PRODUCTION_DATABASE_NAME}?sslmode=require&channel_binding=require`)
    expect(target.displayUrl).not.toContain(PASSWORD)
    expect(target.displayUrl).not.toContain(USER)
  })

  it("treats an absent port as the postgres default", () => {
    expect(assertProductionTarget(input({ databaseUrl: urlFor({ port: "" }) })).port).toBe("5432")
  })

  it("refuses an unset, unparseable or non-postgres connection string", () => {
    expect(refusal(input({ databaseUrl: undefined }))).toMatch(/DATABASE_URL is not set/)
    expect(refusal(input({ databaseUrl: "   " }))).toMatch(/DATABASE_URL is not set/)
    expect(refusal(input({ databaseUrl: "not a connection string" }))).toMatch(/not a parseable/)
    expect(refusal(input({ databaseUrl: `mysql://${USER}:${PASSWORD}@${HOST}:5432/db` }))).toMatch(/only postgres connection strings/)
  })

  it("refuses an unset or mismatched PRODUCTION_DATABASE_HOST", () => {
    expect(refusal(input({ productionDatabaseHost: undefined }))).toMatch(/PRODUCTION_DATABASE_HOST is not set/)
    expect(refusal(input({ productionDatabaseHost: "  " }))).toMatch(/PRODUCTION_DATABASE_HOST is not set/)
    expect(refusal(input({ databaseUrl: urlFor({ host: "ep-elsewhere.neon.tech" }) }))).toMatch(/does not match PRODUCTION_DATABASE_HOST/)
  })

  it("refuses loopback, pooled and non-default-port targets", () => {
    expect(refusal(input({ databaseUrl: urlFor({ host: "127.0.0.1" }) }))).toMatch(/loopback host/)
    expect(refusal(input({ databaseUrl: urlFor({ host: "localhost" }) }))).toMatch(/loopback host/)
    expect(refusal(input({ databaseUrl: urlFor({ host: "abc.pooler.neon.tech" }) }))).toMatch(/pooled endpoint/)
    expect(refusal(input({ databaseUrl: urlFor({ port: "5433" }) }))).toMatch(/port 5433/)
  })

  it("refuses the wrong database name", () => {
    expect(refusal(input({ databaseUrl: urlFor({ database: "staging" }) }))).toMatch(/the production database is "neondb"/)
    expect(refusal(input({ databaseUrl: urlFor({ database: "neondb_test" }) }))).toMatch(/the production database is "neondb"/)
  })

  it("refuses missing or weakened TLS parameters", () => {
    expect(refusal(input({ databaseUrl: urlFor({ params: "channel_binding=require" }) }))).toMatch(/must carry sslmode=require \(observed: absent\)/)
    expect(refusal(input({ databaseUrl: urlFor({ params: "sslmode=prefer&channel_binding=require" }) }))).toMatch(/must carry sslmode=require/)
    expect(refusal(input({ databaseUrl: urlFor({ params: "sslmode=require" }) }))).toMatch(/must carry channel_binding=require/)
    expect(refusal(input({ databaseUrl: urlFor({ params: "sslmode=require&channel_binding=prefer" }) }))).toMatch(/must carry channel_binding=require/)
    expect(refusal(input({ databaseUrl: urlFor({ params: "" }) }))).toMatch(/must carry sslmode=require/)
  })

  it("refuses connection parameters that are not part of the pinned identity", () => {
    expect(refusal(input({ databaseUrl: urlFor({ params: "sslmode=require&channel_binding=require&host=/var/run/postgresql" }) }))).toMatch(
      /unexpected connection parameters \(host\)/,
    )
    expect(refusal(input({ databaseUrl: urlFor({ params: "sslmode=require&channel_binding=require&options=-csearch_path" }) }))).toMatch(
      /unexpected connection parameters \(options\)/,
    )
  })

  it("refuses a test connection string that is not local and disposable", () => {
    expect(refusal(input({ testDatabaseUrl: `postgresql://${USER}:${PASSWORD}@ep-elsewhere.neon.tech:5432/neondb` }))).toMatch(
      /must stay on a local, disposable database/,
    )
    expect(refusal(input({ testDatabaseUrl: PRODUCTION_URL }))).toMatch(/must stay on a local, disposable database/)
    expect(refusal(input({ testDatabaseUrl: "postgresql://school@127.0.0.1:5433/school_management" }))).toMatch(/disposable test database/)
    expect(refusal(input({ testDatabaseUrl: "not a connection string" }))).toMatch(/TEST_DATABASE_URL is set but is not a parseable/)
    expect(assertProductionTarget(input({ testDatabaseUrl: undefined })).host).toBe(HOST)
    expect(assertProductionTarget(input({ testDatabaseUrl: "   " })).host).toBe(HOST)
  })

  it("refuses connection strings and libpq overrides injected by the shell", () => {
    expect(refusal(input({ shellEnv: { DATABASE_URL: urlFor({ host: "ep-elsewhere.neon.tech" }) } }))).toMatch(
      /set in the shell environment \(DATABASE_URL\)/,
    )
    expect(refusal(input({ shellEnv: { TEST_DATABASE_URL: TEST_URL } }))).toMatch(/set in the shell environment \(TEST_DATABASE_URL\)/)
    expect(refusal(input({ shellEnv: { DATABASE_URL: "", TEST_DATABASE_URL: TEST_URL } }))).toMatch(/set in the shell environment \(TEST_DATABASE_URL\)/)
    expect(refusal(input({ shellEnv: { PGHOST: HOST, PGPASSWORD: PASSWORD } }))).toMatch(/libpq environment overrides are set \(PGHOST, PGPASSWORD\)/)
    expect(assertProductionTarget(input({ shellEnv: { PATH: "C:\\Windows", NODE_ENV: "production" } })).host).toBe(HOST)
  })
})

describe("displayTargetUrl", () => {
  it("masks both halves of the credential", () => {
    const display = displayTargetUrl(PRODUCTION_URL)
    expect(display).toBe(`postgresql://***:***@${HOST}:5432/${PRODUCTION_DATABASE_NAME}?sslmode=require&channel_binding=require`)
    expect(display).not.toContain(USER)
    expect(display).not.toContain(PASSWORD)
  })

  it("keeps credential-free URLs readable", () => {
    expect(displayTargetUrl("postgresql://localhost/school_management")).toBe("postgresql://localhost/school_management")
  })

  it("never echoes an unparseable value", () => {
    expect(displayTargetUrl("not a connection string")).toBe("<unparseable database URL>")
  })
})
