import { describe, expect, it } from "vitest"
import {
  parseStagingTargetArgs,
  resolveStagingTarget,
  type StagingTargetArgs,
} from "../src/lib/staging-target.js"

const STAGING_HOST = "ep-staging-123456.eu-central-1.aws.neon.tech"
const STAGING_POOLED_HOST = "ep-staging-123456-pooler.eu-central-1.aws.neon.tech"
const PRODUCTION_HOST = "ep-production-654321.eu-central-1.aws.neon.tech"
const STAGING_DATABASE = "neondb"
const STAGING_USER = "neondb_owner"
const STAGING_PASSWORD = "staging-pass"

function stagingUrl(
  options: {
    host?: string
    port?: string
    database?: string
    user?: string
    password?: string
    params?: string
  } = {},
): string {
  const host = options.host ?? STAGING_HOST
  const port = options.port ?? "5432"
  const database = options.database ?? STAGING_DATABASE
  const user = options.user ?? STAGING_USER
  const password = options.password ?? STAGING_PASSWORD
  const params = options.params ?? "sslmode=require&channel_binding=require"
  const authority = port === "" ? host : `${host}:${port}`
  const query = params === "" ? "" : `?${params}`
  return `postgresql://${user}:${password}@${authority}/${database}${query}`
}

const VALID_ENV: Record<string, string | undefined> = {
  STAGING_DATABASE_URL: stagingUrl(),
  PRODUCTION_DATABASE_HOST: PRODUCTION_HOST,
  PRODUCTION_DATABASE_NAME: STAGING_DATABASE,
}

const VALID_ARGS: StagingTargetArgs = {
  targetEnv: "STAGING_DATABASE_URL",
  stagingProject: "sms-integration-test",
  confirmHost: STAGING_HOST,
  confirmPort: "5432",
  confirmDatabase: STAGING_DATABASE,
}

function refusal(
  env: Record<string, string | undefined>,
  args: StagingTargetArgs,
): string {
  try {
    resolveStagingTarget(env, args)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    expect(message).not.toContain(STAGING_PASSWORD)
    expect(message).not.toContain(STAGING_USER)
    expect(message).not.toContain("postgresql://")
    expect(message).not.toContain("@")
    return message
  }
  throw new Error("expected the guard to refuse this target")
}

describe("parseStagingTargetArgs", () => {
  it("parses all required flags with either value syntax", () => {
    expect(
      parseStagingTargetArgs([
        "--target-env",
        "STAGING_DATABASE_URL",
        "--staging-project",
        "sms-integration-test",
        "--confirm-host",
        STAGING_HOST,
        "--confirm-port",
        "5432",
        "--confirm-database",
        STAGING_DATABASE,
      ]),
    ).toEqual(VALID_ARGS)

    expect(
      parseStagingTargetArgs([
        "--target-env=STAGING_DATABASE_URL",
        "--staging-project=sms-integration-test",
        `--confirm-host=${STAGING_HOST}`,
        "--confirm-port=5432",
        `--confirm-database=${STAGING_DATABASE}`,
      ]),
    ).toEqual(VALID_ARGS)
  })

  it("rejects missing values, duplicates and unknown flags", () => {
    expect(() => parseStagingTargetArgs(["--target-env"])).toThrow(/requires a value/i)
    expect(() =>
      parseStagingTargetArgs([
        "--target-env",
        "STAGING_DATABASE_URL",
        "--target-env",
        "STAGING_DATABASE_URL",
      ]),
    ).toThrow(/more than once/i)
    expect(() => parseStagingTargetArgs(["--force"])).toThrow(/unsupported argument/i)
    expect(() => parseStagingTargetArgs(["positional"])).toThrow(/unsupported argument/i)
  })

  it("requires every flag", () => {
    const missing = [
      "--staging-project",
      "sms-integration-test",
      "--confirm-host",
      STAGING_HOST,
      "--confirm-port",
      "5432",
      "--confirm-database",
      STAGING_DATABASE,
    ]
    expect(() => parseStagingTargetArgs(missing)).toThrow(/--target-env is required/i)
  })
})

describe("resolveStagingTarget", () => {
  it("accepts the exact direct staging endpoint and returns only non-secret identity", () => {
    const target = resolveStagingTarget(VALID_ENV, VALID_ARGS)

    expect(target.host).toBe(STAGING_HOST)
    expect(target.port).toBe("5432")
    expect(target.database).toBe(STAGING_DATABASE)
    expect(target.user).toBe(STAGING_USER)
    expect(target.display).toBe(`${STAGING_HOST}:5432/${STAGING_DATABASE}`)
    expect(target.display).not.toContain(STAGING_PASSWORD)
    expect(target.display).not.toContain(STAGING_USER)
    expect(target.display).not.toContain("postgresql://")
  })

  it("requires the exact target environment variable name", () => {
    expect(
      refusal({ ...VALID_ENV, STAGING_DATABASE_URL: undefined }, VALID_ARGS),
    ).toMatch(/STAGING_DATABASE_URL is not set/i)

    expect(
      refusal(VALID_ENV, { ...VALID_ARGS, targetEnv: "DATABASE_URL" }),
    ).toMatch(/--target-env must be STAGING_DATABASE_URL/i)
  })

  it("requires production identity and the staging project label", () => {
    expect(
      refusal(
        { STAGING_DATABASE_URL: stagingUrl(), PRODUCTION_DATABASE_NAME: STAGING_DATABASE },
        VALID_ARGS,
      ),
    ).toMatch(/PRODUCTION_DATABASE_HOST is required/i)

    expect(
      refusal(
        { STAGING_DATABASE_URL: stagingUrl(), PRODUCTION_DATABASE_HOST: PRODUCTION_HOST },
        VALID_ARGS,
      ),
    ).toMatch(/PRODUCTION_DATABASE_NAME is required/i)

    expect(
      refusal(VALID_ENV, { ...VALID_ARGS, stagingProject: "production" }),
    ).toMatch(/--staging-project must be sms-integration-test/i)
  })

  it("does not use PRODUCTION_DATABASE_NAME as a deny key", () => {
    expect(
      resolveStagingTarget(
        { ...VALID_ENV, PRODUCTION_DATABASE_NAME: "production_database" },
        VALID_ARGS,
      ).database,
    ).toBe(STAGING_DATABASE)
  })

  it("refuses production, loopback/unspecified, pooled, socket and non-default-port targets", () => {
    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: PRODUCTION_HOST }) },
        { ...VALID_ARGS, confirmHost: PRODUCTION_HOST },
      ),
    ).toMatch(/matches PRODUCTION_DATABASE_HOST/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: "127.0.0.1" }) },
        { ...VALID_ARGS, confirmHost: "127.0.0.1" },
      ),
    ).toMatch(/loopback or unspecified host/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: "0.0.0.0" }) },
        { ...VALID_ARGS, confirmHost: "0.0.0.0" },
      ),
    ).toMatch(/loopback or unspecified host/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: "[::]" }) },
        { ...VALID_ARGS, confirmHost: "[::]" },
      ),
    ).toMatch(/loopback or unspecified host/i)

    expect(
      refusal(
        {
          ...VALID_ENV,
          STAGING_DATABASE_URL: stagingUrl({ host: "[::ffff:127.0.0.1]" }),
        },
        { ...VALID_ARGS, confirmHost: "[::ffff:127.0.0.1]" },
      ),
    ).toMatch(/loopback or unspecified host/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: "[::ffff:7f00:1]" }) },
        { ...VALID_ARGS, confirmHost: "[::ffff:7f00:1]" },
      ),
    ).toMatch(/loopback or unspecified host/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: "[::ffff:0:0]" }) },
        { ...VALID_ARGS, confirmHost: "[::ffff:0:0]" },
      ),
    ).toMatch(/loopback or unspecified host/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: STAGING_POOLED_HOST }) },
        { ...VALID_ARGS, confirmHost: STAGING_POOLED_HOST },
      ),
    ).toMatch(/pooled endpoint/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ host: "pgbouncer.example.com" }) },
        { ...VALID_ARGS, confirmHost: "pgbouncer.example.com" },
      ),
    ).toMatch(/pooled endpoint/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: "postgresql:///neondb?host=/var/run/postgresql&sslmode=require" },
        VALID_ARGS,
      ),
    ).toMatch(/Unix socket/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ port: "5433" }) },
        { ...VALID_ARGS, confirmPort: "5433" },
      ),
    ).toMatch(/port 5433/i)
  })

  it("refuses missing or weakened TLS and unexpected connection parameters", () => {
    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ params: "channel_binding=require" }) },
        VALID_ARGS,
      ),
    ).toMatch(/sslmode=require or stronger \(observed: absent\)/i)

    expect(
      refusal(
        {
          ...VALID_ENV,
          STAGING_DATABASE_URL: stagingUrl({ params: "sslmode=prefer&channel_binding=require" }),
        },
        VALID_ARGS,
      ),
    ).toMatch(/sslmode=require or stronger/i)

    expect(
      refusal(
        {
          ...VALID_ENV,
          STAGING_DATABASE_URL: stagingUrl({
            params: "sslmode=require&host=/var/run/postgresql",
          }),
        },
        VALID_ARGS,
      ),
    ).toMatch(/unexpected connection parameters \(host\)/i)

    expect(
      refusal(
        {
          ...VALID_ENV,
          STAGING_DATABASE_URL: stagingUrl({
            params: "sslmode=require&sslmode=prefer",
          }),
        },
        VALID_ARGS,
      ),
    ).toMatch(/duplicate connection parameters \(sslmode\)/i)
  })

  it("refuses missing user, database and host components", () => {
    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ user: "" }) },
        VALID_ARGS,
      ),
    ).toMatch(/no user name/i)

    expect(
      refusal(
        { ...VALID_ENV, STAGING_DATABASE_URL: stagingUrl({ database: "" }) },
        VALID_ARGS,
      ),
    ).toMatch(/no database name/i)
  })

  it("refuses production mode and shell-level environment overrides", () => {
    expect(
      refusal({ ...VALID_ENV, NODE_ENV: "production" }, VALID_ARGS),
    ).toMatch(/NODE_ENV=production/i)

    expect(
      refusal({ ...VALID_ENV, NODE_TLS_REJECT_UNAUTHORIZED: "0" }, VALID_ARGS),
    ).toMatch(/NODE_TLS_REJECT_UNAUTHORIZED=0/i)

    expect(
      refusal({ ...VALID_ENV, NODE_OPTIONS: "-r dotenv/config" }, VALID_ARGS),
    ).toMatch(/NODE_OPTIONS is set/i)

    expect(
      refusal({ ...VALID_ENV, NODE_OPTIONS: "--env-file=.env" }, VALID_ARGS),
    ).toMatch(/NODE_OPTIONS is set/i)

    expect(() =>
      resolveStagingTarget({ ...VALID_ENV, NODE_OPTIONS: "" }, VALID_ARGS),
    ).not.toThrow()

    expect(
      refusal({ ...VALID_ENV, DOTENV_CONFIG_PATH: ".env" }, VALID_ARGS),
    ).toMatch(/DOTENV_\* configuration is set/i)

    expect(
      refusal({ ...VALID_ENV, DATABASE_URL: stagingUrl() }, VALID_ARGS),
    ).toMatch(/conflicting connection strings \(DATABASE_URL\)/i)

    expect(
      refusal(
        {
          ...VALID_ENV,
          MIGRATION_DATABASE_URL: stagingUrl(),
          TEST_DATABASE_URL: stagingUrl(),
        },
        VALID_ARGS,
      ),
    ).toMatch(/MIGRATION_DATABASE_URL, TEST_DATABASE_URL/i)

    expect(
      refusal({ ...VALID_ENV, PGHOST: STAGING_HOST, PGPASSWORD: STAGING_PASSWORD }, VALID_ARGS),
    ).toMatch(/libpq environment overrides are set \(PGHOST, PGPASSWORD\)/i)
  })

  it("requires exact host, port and database confirmations", () => {
    expect(
      refusal(VALID_ENV, { ...VALID_ARGS, confirmHost: "ep-other.neon.tech" }),
    ).toMatch(/--confirm-host does not match/i)
    expect(
      refusal(VALID_ENV, { ...VALID_ARGS, confirmPort: "5433" }),
    ).toMatch(/--confirm-port does not match/i)
    expect(
      refusal(VALID_ENV, { ...VALID_ARGS, confirmDatabase: "other" }),
    ).toMatch(/--confirm-database does not match/i)
  })
})
