// Global setup: verify the test database identity, then apply migrations once
// before any DB-backed suite runs. Vitest injects DATABASE_URL and the six
// remote-identity values into workers from `test.env` (see test-database-env.ts).
import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import { assertDirectDatabaseUrl } from "../../src/lib/database-target.js"
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js"
import { assertRuntimeDatabaseIdentity } from "./test-database-identity.js"

export default async function setup(): Promise<void> {
  const rawUrl = process.env.TEST_DATABASE_URL
  if (rawUrl === undefined || rawUrl.trim() === "") {
    return
  }

  assertSafeTestDatabaseUrl(rawUrl)
  const target = assertDirectDatabaseUrl(rawUrl, "migrating the test database")

  const prisma = new PrismaClient({ datasourceUrl: rawUrl })
  try {
    const result = await prisma.$queryRawUnsafe<
      Array<{ dbName: string; userName: string }>
    >('SELECT current_database() AS "dbName", current_user AS "userName"')
    const row = result[0]
    assertRuntimeDatabaseIdentity({
      urlHost: target.host,
      urlDatabase: target.database,
      connected: {
        database: row?.dbName ?? "",
        user: row?.userName ?? "",
      },
      env: process.env,
      displayUrl: target.displayUrl,
    })
  } finally {
    await prisma.$disconnect().catch(() => {})
  }

  try {
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "server/prisma/schema.prisma",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: rawUrl,
          TEST_DATABASE_URL: rawUrl,
          NODE_ENV: "test",
        },
        stdio: "pipe",
      },
    )
  } catch (error) {
    const status = (error as { status?: number }).status
    throw new Error(
      `Refusing to run the DB-backed integration suites: test database migration failed` +
        (status === undefined ? "." : ` (exit code ${status}).`),
    )
  }
}
