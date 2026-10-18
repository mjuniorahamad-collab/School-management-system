import path from "node:path"
import { defineConfig } from "vitest/config"
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
// ALLOW_REMOTE_TEST_DATABASE=1 + EXPECTED_TEST_DATABASE_HOST + PRODUCTION_DATABASE_HOST.
assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL)

const integrationEnv: Record<string, string> = { TZ: "America/New_York" }
if (process.env.TEST_DATABASE_URL) {
  integrationEnv.DATABASE_URL = process.env.TEST_DATABASE_URL
  integrationEnv.NODE_ENV = "test"
}

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
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ["./server/tests/helpers/test-database-identity.global-setup.ts"],
    setupFiles: ["./server/tests/helpers/verify-worker-db-url.setup.ts"],
  },
})
