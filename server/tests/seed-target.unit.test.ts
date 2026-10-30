import { describe, expect, it } from "vitest"
import { assertSeedTarget } from "../src/lib/seed-target.js"

const LOCAL = "postgresql://school:secret@127.0.0.1:5433/school_management"
const REMOTE = "postgresql://school:secret@ep-quiet-lab.neon.tech/neondb"
const PRODUCTION = "postgresql://school:secret@ep-prod.neon.tech/neondb"
const PRODUCTION_ENV = {
  PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
  PRODUCTION_DATABASE_NAME: "neondb",
}

describe("assertSeedTarget", () => {
  it("refuses production mode unconditionally", () => {
    expect(() =>
      assertSeedTarget({ NODE_ENV: "production", DATABASE_URL: LOCAL }, ["--allow-non-local"]),
    ).toThrow(/never runs with NODE_ENV=production/i)
  })

  it("requires DATABASE_URL", () => {
    expect(() => assertSeedTarget({}, [])).toThrow(/DATABASE_URL is not set/i)
    expect(() => assertSeedTarget({ DATABASE_URL: "not a URL" }, [])).toThrow(
      /not a parseable PostgreSQL connection string/i,
    )
  })

  it("rejects an empty database name before any write", () => {
    expect(() =>
      assertSeedTarget({ DATABASE_URL: "postgresql://school@127.0.0.1:5433/" }, []),
    ).toThrow(/no database name/i)
  })

  it("allows local targets without identity or approval", () => {
    expect(() => assertSeedTarget({ DATABASE_URL: LOCAL }, [])).not.toThrow()
  })

  it("requires per-invocation approval for remote targets", () => {
    expect(() =>
      assertSeedTarget({ DATABASE_URL: REMOTE, ...PRODUCTION_ENV }, []),
    ).toThrow(/--allow-non-local/i)
  })

  it("requires production identity before accepting a remote target", () => {
    expect(() => assertSeedTarget({ DATABASE_URL: REMOTE }, ["--allow-non-local"])).toThrow(
      /PRODUCTION_DATABASE_HOST is required/i,
    )
    expect(() =>
      assertSeedTarget(
        { DATABASE_URL: REMOTE, PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech" },
        ["--allow-non-local"],
      ),
    ).toThrow(/PRODUCTION_DATABASE_NAME is required/i)
  })

  it("refuses a production-equivalent remote target", () => {
    expect(() =>
      assertSeedTarget({ DATABASE_URL: PRODUCTION, ...PRODUCTION_ENV }, ["--allow-non-local"]),
    ).toThrow(/target is the production database/i)
  })

  it("accepts a known non-production remote target with approval", () => {
    expect(() =>
      assertSeedTarget({ DATABASE_URL: REMOTE, ...PRODUCTION_ENV }, ["--allow-non-local"]),
    ).not.toThrow()
  })
})
