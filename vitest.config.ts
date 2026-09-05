import path from "node:path"
import { defineConfig } from "vitest/config"

// Load .env early so TEST_DATABASE_URL is available before vitest's env injection.
// This mirrors what server/src/config/env.ts does at import time.
try {
  process.loadEnvFile()
} catch {
  // .env not found — rely on shell-injected env vars.
}

// When a test database is configured (TEST_DATABASE_URL), the integration
// suites run against it; otherwise they skip and only DB-free tests execute.
const integrationEnv: Record<string, string> = {}
if (process.env.TEST_DATABASE_URL) {
  integrationEnv.DATABASE_URL = process.env.TEST_DATABASE_URL
  integrationEnv.NODE_ENV = "test"
}

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
    include: ["server/tests/**/*.test.ts", "src/**/*.test.ts"],
    env: integrationEnv,
    // The audit-logs suite runs `prisma migrate deploy` on a cold test DB in
    // beforeAll, which can exceed the default 10s hook timeout.
    hookTimeout: 120_000,
    // The DB-backed integration suites share a single TEST_DATABASE_URL and each
    // reset the tables in beforeAll; run files serially to avoid cross-file
    // races on the shared schema.
    fileParallelism: false,
  },
})
