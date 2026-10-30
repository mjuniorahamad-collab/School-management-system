import { describe, expect, it } from "vitest"
import { buildIntegrationEnv } from "./helpers/test-database-env.js"
import { assertSafeTestDatabaseUrl } from "./helpers/test-database-guard.js"

const LOCAL_URL = "postgresql://school:secret@127.0.0.1:5433/school_management_test"
const REMOTE_URL = "postgresql://school:secret@ep-test-123.neon.tech/neondb?sslmode=require"

const REMOTE_IDENTITY = {
  ALLOW_REMOTE_TEST_DATABASE: "1",
  EXPECTED_TEST_DATABASE_HOST: "ep-test-123.neon.tech",
  EXPECTED_TEST_DATABASE_NAME: "neondb",
  EXPECTED_TEST_DATABASE_USER: "school",
  PRODUCTION_DATABASE_HOST: "ep-prod-456.neon.tech",
  PRODUCTION_DATABASE_NAME: "neondb",
}

describe("buildIntegrationEnv", () => {
  it("returns no database configuration when the test URL is unset", () => {
    expect(buildIntegrationEnv({})).toEqual({})
    expect(buildIntegrationEnv({ TEST_DATABASE_URL: "   " })).toEqual({})
    expect(buildIntegrationEnv({}, { TZ: "America/New_York" })).toEqual({
      TZ: "America/New_York",
    })
  })

  it("uses the test URL for both worker variables and forces NODE_ENV=test", () => {
    expect(buildIntegrationEnv({ TEST_DATABASE_URL: LOCAL_URL, NODE_ENV: "production" })).toEqual({
      DATABASE_URL: LOCAL_URL,
      TEST_DATABASE_URL: LOCAL_URL,
      NODE_ENV: "test",
    })
  })

  it("forwards the remote identity values workers re-validate", () => {
    const env = buildIntegrationEnv({ TEST_DATABASE_URL: REMOTE_URL, ...REMOTE_IDENTITY })
    expect(env).toEqual({
      DATABASE_URL: REMOTE_URL,
      TEST_DATABASE_URL: REMOTE_URL,
      NODE_ENV: "test",
      ...REMOTE_IDENTITY,
    })
    expect(() => assertSafeTestDatabaseUrl(REMOTE_URL, env)).not.toThrow()
  })

  it("does not forward unrelated secrets", () => {
    const env = buildIntegrationEnv({
      TEST_DATABASE_URL: REMOTE_URL,
      ...REMOTE_IDENTITY,
      SEED_ADMIN_PASSWORD: "not-for-workers",
      MIGRATION_DATABASE_URL: "postgresql://school:secret@ep-test-123.neon.tech/neondb",
    })
    expect(env).not.toHaveProperty("SEED_ADMIN_PASSWORD")
    expect(env).not.toHaveProperty("MIGRATION_DATABASE_URL")
  })

  it("omits blank identity values", () => {
    const env = buildIntegrationEnv({
      TEST_DATABASE_URL: REMOTE_URL,
      EXPECTED_TEST_DATABASE_HOST: "",
      PRODUCTION_DATABASE_NAME: "   ",
    })
    expect(env).not.toHaveProperty("EXPECTED_TEST_DATABASE_HOST")
    expect(env).not.toHaveProperty("PRODUCTION_DATABASE_NAME")
  })
})
