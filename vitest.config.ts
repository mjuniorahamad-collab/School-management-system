import path from "node:path"
import { configDefaults, defineConfig } from "vitest/config"
import { buildIntegrationEnv } from "./server/tests/helpers/test-database-env.ts"
import { assertSafeTestDatabaseUrl } from "./server/tests/helpers/test-database-guard.ts"

// Load .env early so TEST_DATABASE_URL is available before vitest's env injection.
// This mirrors what server/src/config/env.ts does at import time.
try {
  process.loadEnvFile()
} catch {
  // .env not found — rely on shell-injected env vars.
}

// Refuse to hand the integration suites anything but a disposable test database.
// Their teardown deletes every row in the target, so this must run BEFORE
// `integrationEnv` is built — a worker must never be able to receive an
// unvalidated DATABASE_URL. A misconfiguration fails the whole run loudly rather
// than silently skipping coverage.
//
// A loopback target is validated by its "test" database name. A remote target
// (e.g. a throwaway Neon project) additionally requires
// ALLOW_REMOTE_TEST_DATABASE=1, EXPECTED_TEST_DATABASE_HOST,
// PRODUCTION_DATABASE_HOST and PRODUCTION_DATABASE_NAME. The URL must be a
// direct, unpooled endpoint because global setup migrates it. The non-secret
// identity values are forwarded to workers so they can re-run the same guards.
assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL)

// When a test database is configured (TEST_DATABASE_URL), the integration
// suites run against it; otherwise they skip and only DB-free tests execute.
// Remote-target identity values are forwarded so worker-side reset guards see
// the same validated target as global setup.
const integrationEnv = buildIntegrationEnv(process.env)

export default defineConfig({
  resolve: {
    // Server modules import relative files with explicit `.js` extensions
    // (NodeNext emit style). Map them to their `.ts` sources during tests.
    extensionAlias: {
      ".js": [".ts", ".tsx", ".d.ts"],
    },
    // The frontend uses the `@/` alias; keep it resolvable for the frontend
    // pure-logic unit tests that live next to the source.
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // `.test.tsx` suites opt into a DOM per file with
    // `// @vitest-environment jsdom`; everything else runs in node.
    include: ["server/tests/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    // The timezone regression suite asserts a negative-UTC-offset host and only
    // runs via `vitest.timezone.config.ts` (npm run test:tz).
    exclude: [...configDefaults.exclude, "server/tests/dashboard.timezone.test.ts"],
    env: integrationEnv,
    // Ordinary tests should never hang forever; the default 5s is too tight for
    // the DB-backed suites on a cold or slow machine. The timetable-scale suite
    // raises this only for itself (below).
    testTimeout: 30_000,
    // Global setup applies migrations once after the identity probe. A cold test
    // database can exceed the default 10s hook timeout.
    hookTimeout: 120_000,
    // The DB-backed integration suites share a single TEST_DATABASE_URL and each
    // resets the tables in beforeAll; run files serially to avoid cross-file
    // races on the shared schema.
    fileParallelism: false,
    globalSetup: ["./server/tests/helpers/test-database-identity.global-setup.ts"],
    setupFiles: ["./server/tests/helpers/verify-worker-db-url.setup.ts"],
  },
})
