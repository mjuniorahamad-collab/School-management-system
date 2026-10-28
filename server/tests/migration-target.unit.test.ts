import { describe, expect, it } from "vitest"
import { parseDatabaseTarget } from "../src/lib/database-target.js"
import {
  assertRemoteApprovals,
  parseDeploymentArgs,
  resolveMigrationExecutionTarget,
} from "../src/lib/migration-target.js"

const POOLED = "postgresql://school:secret@ep-quiet-lab-pooler.neon.tech/neondb?sslmode=require"
const DIRECT = "postgresql://school:secret@ep-quiet-lab.neon.tech/neondb?sslmode=require"
const PRODUCTION = "postgresql://school:secret@ep-prod.neon.tech/neondb?sslmode=require"
const PRODUCTION_ENV = {
  PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
  PRODUCTION_DATABASE_NAME: "neondb",
}
const APPROVAL = {
  allowProduction: false,
  confirmHost: "ep-quiet-lab.neon.tech",
  confirmPort: "5432",
  confirmDatabase: "neondb",
}

describe("parseDeploymentArgs", () => {
  it("parses every flag", () => {
    expect(
      parseDeploymentArgs([
        "--allow-production",
        "--confirm-host",
        "ep-prod.neon.tech",
        "--confirm-port",
        "5432",
        "--confirm-database",
        "neondb",
      ]),
    ).toEqual({
      allowProduction: true,
      confirmHost: "ep-prod.neon.tech",
      confirmPort: "5432",
      confirmDatabase: "neondb",
    })
  })

  it("rejects missing values and unknown arguments", () => {
    expect(() => parseDeploymentArgs(["--confirm-host"])).toThrow(/requires a value/i)
    expect(() => parseDeploymentArgs(["--confirm-host", "--confirm-port"])).toThrow(
      /requires a value/i,
    )
    expect(() => parseDeploymentArgs(["--yes"])).toThrow(/unsupported migration argument/i)
  })
})

describe("resolveMigrationExecutionTarget", () => {
  it("uses a direct app URL as-is", () => {
    expect(resolveMigrationExecutionTarget(DIRECT, {}).raw).toBe(DIRECT)
  })

  it("requires MIGRATION_DATABASE_URL for a pooled app URL", () => {
    expect(() => resolveMigrationExecutionTarget(POOLED, {})).toThrow(
      /Set MIGRATION_DATABASE_URL/i,
    )
  })

  it("accepts a direct MIGRATION_DATABASE_URL for the same database", () => {
    const target = resolveMigrationExecutionTarget(POOLED, {
      MIGRATION_DATABASE_URL: DIRECT,
    })
    expect(target.raw).toBe(DIRECT)
    expect(target.host).toBe("ep-quiet-lab.neon.tech")
  })

  it("rejects a direct URL for a different database or host", () => {
    expect(() =>
      resolveMigrationExecutionTarget(POOLED, {
        MIGRATION_DATABASE_URL: "postgresql://school:secret@ep-quiet-lab.neon.tech/other",
      }),
    ).toThrow(/does not name the same database/i)
    expect(() =>
      resolveMigrationExecutionTarget(POOLED, {
        MIGRATION_DATABASE_URL: "postgresql://school:secret@ep-other.neon.tech/neondb",
      }),
    ).toThrow(/does not name the same database/i)
  })

  it("rejects a pooled MIGRATION_DATABASE_URL", () => {
    expect(() =>
      resolveMigrationExecutionTarget(POOLED, {
        MIGRATION_DATABASE_URL: POOLED,
      }),
    ).toThrow(/pooled endpoint/i)
  })
})

describe("assertRemoteApprovals", () => {
  const nonProduction = parseDatabaseTarget(DIRECT)!

  it("requires all three exact confirmations", () => {
    expect(() => assertRemoteApprovals(nonProduction, PRODUCTION_ENV, { ...APPROVAL, confirmPort: null })).toThrow(
      /requires --confirm-host, --confirm-port and --confirm-database/i,
    )
    expect(() =>
      assertRemoteApprovals(nonProduction, PRODUCTION_ENV, { ...APPROVAL, confirmHost: "other" }),
    ).toThrow(/do not match/i)
    expect(() =>
      assertRemoteApprovals(nonProduction, PRODUCTION_ENV, { ...APPROVAL, confirmPort: "5433" }),
    ).toThrow(/do not match/i)
    expect(() =>
      assertRemoteApprovals(nonProduction, PRODUCTION_ENV, {
        ...APPROVAL,
        confirmDatabase: "other",
      }),
    ).toThrow(/do not match/i)
  })

  it("accepts a non-production remote target with confirmations", () => {
    expect(() => assertRemoteApprovals(nonProduction, PRODUCTION_ENV, APPROVAL)).not.toThrow()
  })

  it("refuses --allow-production for a non-production target", () => {
    expect(() =>
      assertRemoteApprovals(nonProduction, PRODUCTION_ENV, {
        ...APPROVAL,
        allowProduction: true,
      }),
    ).toThrow(/only valid for a production-equivalent target/i)
  })

  it("requires --allow-production for a production-equivalent target", () => {
    const production = parseDatabaseTarget(PRODUCTION)!
    expect(() =>
      assertRemoteApprovals(production, PRODUCTION_ENV, {
        ...APPROVAL,
        confirmHost: "ep-prod.neon.tech",
      }),
    ).toThrow(/production-equivalent/i)
    expect(() =>
      assertRemoteApprovals(production, PRODUCTION_ENV, {
        ...APPROVAL,
        allowProduction: true,
        confirmHost: "ep-prod.neon.tech",
      }),
    ).not.toThrow()
  })

  it("requires production identity before classifying a remote target", () => {
    expect(() => assertRemoteApprovals(nonProduction, {}, APPROVAL)).toThrow(
      /PRODUCTION_DATABASE_HOST is required/i,
    )
    expect(() =>
      assertRemoteApprovals(nonProduction, { PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech" }, APPROVAL),
    ).toThrow(/PRODUCTION_DATABASE_NAME is required/i)
  })
})
