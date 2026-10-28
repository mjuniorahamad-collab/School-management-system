import type { PrismaClient } from "@prisma/client"
import { assertDirectDatabaseUrl } from "../../src/lib/database-target.js"
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js"
import { assertRuntimeDatabaseIdentity } from "./test-database-identity.js"

export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL
  if (testUrl === undefined || testUrl.trim() === "") {
    throw new Error("Refusing to reset tables: TEST_DATABASE_URL is not set.")
  }
  if (process.env.DATABASE_URL !== testUrl) {
    throw new Error(
      "Refusing to reset tables: DATABASE_URL does not match TEST_DATABASE_URL. " +
        "Connection strings are intentionally not printed.",
    )
  }

  assertSafeTestDatabaseUrl(testUrl)
  const target = assertDirectDatabaseUrl(testUrl, "resetting the test database")

  await prisma.$transaction(
    async (tx) => {
      const result = await tx.$queryRawUnsafe<
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

      await tx.$executeRawUnsafe('TRUNCATE TABLE "School" CASCADE')
      await tx.permission.deleteMany()
      await tx.role.deleteMany()
    },
    { maxWait: 15_000, timeout: 120_000 },
  )
}
