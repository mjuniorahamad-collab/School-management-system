import { describe, expect, it } from "vitest"
import {
  assertBootstrapTarget,
  parseBootstrapArgs,
} from "../src/lib/bootstrap-target.js"

const LOCAL = "postgresql://school:secret@127.0.0.1:5433/school_management"
const REMOTE = "postgresql://school:secret@ep-quiet-lab.neon.tech/neondb"
const PRODUCTION_ENV = {
  PRODUCTION_DATABASE_HOST: "ep-prod.neon.tech",
  PRODUCTION_DATABASE_NAME: "neondb",
}
const LOCAL_ARGS = {
  check: false,
  verify: false,
  confirmHost: "127.0.0.1",
  confirmPort: "5433",
  confirmDatabase: "school_management",
}
const REMOTE_ARGS = {
  ...LOCAL_ARGS,
  confirmHost: "ep-quiet-lab.neon.tech",
  confirmPort: "5432",
  confirmDatabase: "neondb",
}

describe("parseBootstrapArgs", () => {
  it("parses read-only modes and confirmations", () => {
    expect(parseBootstrapArgs(["--check"])).toMatchObject({ check: true, verify: false })
    expect(parseBootstrapArgs(["--verify"])).toMatchObject({ check: false, verify: true })
    expect(
      parseBootstrapArgs([
        "--confirm-host",
        "127.0.0.1",
        "--confirm-port",
        "5433",
        "--confirm-database",
        "school_management",
      ]),
    ).toMatchObject(LOCAL_ARGS)
  })

  it("rejects both read-only modes together and unknown flags", () => {
    expect(() => parseBootstrapArgs(["--check", "--verify"])).toThrow(/either --check or --verify/i)
    expect(() => parseBootstrapArgs(["--force"])).toThrow(/unsupported argument/i)
    expect(() => parseBootstrapArgs(["--confirm-host"])).toThrow(/requires a value/i)
  })
})

describe("assertBootstrapTarget", () => {
  it("requires a parseable DATABASE_URL", () => {
    expect(() => assertBootstrapTarget({}, LOCAL_ARGS)).toThrow(/DATABASE_URL is not set/i)
    expect(() => assertBootstrapTarget({ DATABASE_URL: "not a URL" }, LOCAL_ARGS)).toThrow(
      /not a parseable PostgreSQL connection string/i,
    )
  })

  it("rejects an empty database name before confirmation or write", () => {
    expect(() =>
      assertBootstrapTarget(
        { DATABASE_URL: "postgresql://school:secret@127.0.0.1:5433/" },
        LOCAL_ARGS,
      ),
    ).toThrow(/no database name/i)
  })

  it("requires all three exact confirmations for a local write", () => {
    expect(() =>
      assertBootstrapTarget({ DATABASE_URL: LOCAL }, { ...LOCAL_ARGS, confirmHost: null }),
    ).toThrow(/requires --confirm-host, --confirm-port and --confirm-database/i)
    expect(() =>
      assertBootstrapTarget({ DATABASE_URL: LOCAL }, { ...LOCAL_ARGS, confirmHost: "localhost" }),
    ).toThrow(/do not match/i)
    expect(() =>
      assertBootstrapTarget({ DATABASE_URL: LOCAL }, { ...LOCAL_ARGS, confirmPort: "5432" }),
    ).toThrow(/do not match/i)
    expect(() =>
      assertBootstrapTarget({ DATABASE_URL: LOCAL }, { ...LOCAL_ARGS, confirmDatabase: "other" }),
    ).toThrow(/do not match/i)
  })

  it("accepts a local write with exact confirmations and no production identity", () => {
    expect(() => assertBootstrapTarget({ DATABASE_URL: LOCAL }, LOCAL_ARGS)).not.toThrow()
  })

  it("requires production identity for a remote write", () => {
    expect(() => assertBootstrapTarget({ DATABASE_URL: REMOTE }, REMOTE_ARGS)).toThrow(
      /PRODUCTION_DATABASE_HOST is required/i,
    )
    expect(() =>
      assertBootstrapTarget(
        { DATABASE_URL: REMOTE, ...PRODUCTION_ENV },
        REMOTE_ARGS,
      ),
    ).not.toThrow()
  })
})
