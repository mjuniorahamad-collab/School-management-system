import { defineConfig } from "vitest/config"

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
  },
  test: {
    environment: "node",
    include: ["server/tests/**/*.test.ts"],
    env: integrationEnv,
  },
})