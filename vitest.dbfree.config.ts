import path from "node:path"
import { defineConfig } from "vitest/config"

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
      "server/tests/production-target-guard.unit.test.ts",
      "server/tests/permission-reconcile.unit.test.ts",
    ],
    exclude: [],
    env: {},
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
