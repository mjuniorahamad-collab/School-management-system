// Read-only global setup that verifies the connected database identity
// before any integration tests run or migrations execute. No database
// writes occur; only a single SELECT current_database(), current_user.
import { PrismaClient } from "@prisma/client"
import { assertRuntimeDatabaseIdentity } from "./test-database-identity.js"
import { redactDatabaseUrl } from "./test-database-guard.js"

function parseTarget(raw: string): { host: string; database: string; socket: boolean } | null {
  try {
    const url = new URL(raw)
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
    const hostParam = url.searchParams.get("host")
    const socket = url.hostname === "" && hostParam !== null && hostParam.startsWith("/")
    return { host: url.hostname, database, socket }
  } catch {
    return null
  }
}

export default async function setup(): Promise<void> {
  const rawUrl = process.env.TEST_DATABASE_URL
  if (rawUrl === undefined || rawUrl.trim() === "") {
    return // DB-free default; remain no-op
  }

  const target = parseTarget(rawUrl)
  if (target === null) {
    throw new Error(
      "Refusing to run the DB-backed integration suites: TEST_DATABASE_URL is not a parseable connection string.",
    )
  }

  const displayUrl = redactDatabaseUrl(rawUrl)
  const prisma = new PrismaClient({ datasourceUrl: rawUrl })
  try {
    const result = await prisma.$queryRawUnsafe<
      Array<{ dbName: string; userName: string }>
    >('SELECT current_database() AS "dbName", current_user AS "userName"')
    const row = result[0]
    const connected = {
      database: row?.dbName ?? "",
      user: row?.userName ?? "",
    }
    assertRuntimeDatabaseIdentity({
      urlHost: target.host,
      urlDatabase: target.database,
      connected,
      env: process.env,
      displayUrl,
    })
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
}
