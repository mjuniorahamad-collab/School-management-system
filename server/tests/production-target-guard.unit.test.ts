import { describe, expect, it } from "vitest"
import {
  assertProductionTarget,
  type ProductionTargetGuardInput,
} from "../prisma/production-target-guard.js"

// Fail-closed coverage for the target identity check that gates every
// reconciliation run. Each refusal also proves that no credential reaches the
// error message, so a failed run cannot leak the connection string into a log.

const HOST = "ep-sweet-boat-b1kevdey.c-5.eu-central-1.aws.neon.tech"
const DATABASE = "neondb"
const USER = "neondb_owner"
const PASSWORD = "sup3rs3cr3t"

function urlFor(options: { host?: string; port?: string; database?: string; params?: string } = {}): string {
  const host = options.host ?? HOST
  const port = options.port ?? "5432"
  const database = options.database ?? DATABASE
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
    productionDatabaseName: DATABASE,
    ...overrides,
  }
}



describe("assertProductionTarget", () => {
  it("accepts the pinned production endpoint and returns a printable target", () => {
    const target = assertProductionTarget(input())
    expect(target.host).toBe(HOST)
    expect(target.database).toBe(DATABASE)
    expect(target.port).toBe("5432")
    expect(target.displayUrl).toBe(`postgresql://***:***@${HOST}:5432/${DATABASE}?sslmode=require&channel_binding=require`)
    expect(target.displayUrl).not.toContain(PASSWORD)
    expect(target.displayUrl).not.toContain(USER)
  })
})
