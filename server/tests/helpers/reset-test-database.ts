import type { Prisma, PrismaClient } from "@prisma/client"
import { assertDirectDatabaseUrl } from "../../src/lib/database-target.js"
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js"
import { assertRuntimeDatabaseIdentity } from "./test-database-identity.js"

async function withValidatedTestDatabase(
  prisma: PrismaClient,
  purpose: string,
  operation: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL

  if (testUrl === undefined || testUrl.trim() === "") {
    throw new Error("Refusing destructive cleanup: TEST_DATABASE_URL is not set.")
  }
  if (process.env.DATABASE_URL !== testUrl) {
    throw new Error(
      "Refusing destructive cleanup: DATABASE_URL does not match TEST_DATABASE_URL. " +
        "Connection strings are intentionally not printed.",
    )
  }

  assertSafeTestDatabaseUrl(testUrl)
  const target = assertDirectDatabaseUrl(testUrl, purpose)

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

      await operation(tx)
    },
    { maxWait: 15_000, timeout: 120_000 },
  )
}

export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  await withValidatedTestDatabase(
    prisma,
    "resetting the test database",
    async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE TABLE "School" CASCADE')
      await tx.permission.deleteMany()
      await tx.role.deleteMany()
    },
  )
}

export async function resetTestFeeInvoices(prisma: PrismaClient): Promise<void> {
  await withValidatedTestDatabase(
    prisma,
    "clearing test fee invoices",
    async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
    },
  )
}

export async function resetDashboardTransientTables(prisma: PrismaClient): Promise<void> {
  await withValidatedTestDatabase(
    prisma,
    "resetting dashboard test tables",
    async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE TABLE "FeeReceipt" CASCADE')
      await tx.$executeRawUnsafe('TRUNCATE TABLE "FeePayment" CASCADE')
      await tx.$executeRawUnsafe('TRUNCATE TABLE "FeeInstallment" CASCADE')
      await tx.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
      await tx.$executeRawUnsafe('TRUNCATE TABLE "ExamMark" CASCADE')
      await tx.$executeRawUnsafe('TRUNCATE TABLE "ExamResult" CASCADE')
      await tx.$executeRawUnsafe('TRUNCATE TABLE "ExamSubject" CASCADE')
      await tx.$executeRawUnsafe('TRUNCATE TABLE "Exam" CASCADE')
    },
  )
}
