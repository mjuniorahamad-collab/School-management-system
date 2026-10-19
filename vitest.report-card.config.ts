import path from "node:path"
import { defineConfig } from "vitest/config"

// Genuinely database-free test configuration for the Annual Report Card domain
// engine (docs/report-card.md §5-§6, §3). These suites exercise pure functions
// only — no Prisma import, no connection, no clock, no filesystem.
//
// It deliberately diverges from the default `vitest.config.ts` in the three ways
// that could otherwise reach a database:
//   1. It does NOT call `process.loadEnvFile()`, so a `DATABASE_URL` /
//      `TEST_DATABASE_URL` sitting in `.env` is never loaded into the process.
//   2. It registers no `globalSetup` (the database identity probe) and no
//      `setupFiles` (the worker database-URL guard) — both are unnecessary when
//      no test connects, and dropping them keeps the run provably DB-free.
//   3. It clears any inherited database environment variables in the main
//      process before workers are forked, so a shell-exported connection string
//      cannot leak in either.
//
// This is an ADDITIVE, scoped configuration. The default `vitest.config.ts` and
// its safeguards are untouched and continue to protect the DB-backed
// integration suites.
delete process.env.DATABASE_URL
delete process.env.TEST_DATABASE_URL

export default defineConfig({
  resolve: {
    // Server modules import relative files with explicit `.js` extensions
    // (NodeNext emit style). Map them to their `.ts` sources during tests.
    extensionAlias: {
      ".js": [".ts", ".tsx", ".d.ts"],
    },
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["server/tests/report-card-*.unit.test.ts"],
    fileParallelism: false,
  },
})
