import path from "node:path"
import { defineConfig } from "vitest/config"
import { buildIntegrationEnv } from "./server/tests/helpers/test-database-env.ts"
import { assertSafeTestDatabaseUrl } from "./server/tests/helpers/test-database-guard.ts"

// Force a negative-UTC-offset host so the dashboard date-only regression suite
// exercises the exact failure mode that UTC-only CI cannot see. TZ must be set
// before any Date is constructed, hence at the very top of the config.
process.env.TZ = "America/New_York"

try {
  process.loadEnvFile()
} catch {
  // .env not found — rely on shell-injected env vars.
}

// Same disposable-test-database safety gate as the default config: a loopback
// target by its "test" name, or a remote target by exact identity via
// ALLOW_REMOTE_TEST_DATABASE=1 + EXPECTED_TEST_DATABASE_HOST +
// PRODUCTION_DATABASE_HOST + PRODUCTION_DATABASE_NAME. It must be a direct,
// unpooled endpoint because global setup migrates it. The non-secret identity
// values are forwarded to workers so they can re-run the same guards.
assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL)

const integrationEnv = buildIntegrationEnv(process.env, { TZ: "America/New_York" })

export default defineConfig({
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".d.ts"],
    },
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/tests/dashboard.timezone.test.ts",
      "server/tests/dashboard.integration.test.ts",
    ],
    env: integrationEnv,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ["./server/tests/helpers/test-database-identity.global-setup.ts"],
    setupFiles: ["./server/tests/helpers/verify-worker-db-url.setup.ts"],
  },
})
