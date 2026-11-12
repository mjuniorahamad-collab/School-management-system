import type { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"
import { lockSchoolAdminMutations } from "../src/lib/db-locks.js"

interface Captured {
  sql: string
  values: unknown[]
}

function captureTx(): { tx: Prisma.TransactionClient; captured: Captured[] } {
  const captured: Captured[] = []
  const $queryRaw = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> => {
    captured.push({ sql: strings.join("?"), values })
    return Promise.resolve([])
  }
  return { tx: { $queryRaw } as unknown as Prisma.TransactionClient, captured }
}

describe("lockSchoolAdminMutations (database-free)", () => {
  it("casts the advisory-lock result to a Prisma-decodable type", async () => {
    const { tx, captured } = captureTx()
    await lockSchoolAdminMutations(tx, { schoolId: "school-a" })

    expect(captured).toHaveLength(1)
    const { sql } = captured[0]!
    expect(sql).toContain("pg_advisory_xact_lock")
    expect(sql.trimEnd().endsWith("::text")).toBe(true)
  })

  it("uses the fixed last-admin scope keyed by the server-resolved school ID", async () => {
    const { tx, captured } = captureTx()
    await lockSchoolAdminMutations(tx, { schoolId: "school-a" })

    expect(captured[0]!.values).toEqual(["school-a", "last-school-admin"])
  })

  it("uses different lock keys for different schools", async () => {
    const { tx, captured } = captureTx()
    await lockSchoolAdminMutations(tx, { schoolId: "school-a" })
    await lockSchoolAdminMutations(tx, { schoolId: "school-b" })

    expect(captured[0]!.values).toEqual(["school-a", "last-school-admin"])
    expect(captured[1]!.values).toEqual(["school-b", "last-school-admin"])
  })
})
