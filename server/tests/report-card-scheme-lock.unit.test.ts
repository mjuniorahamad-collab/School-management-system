// Database-free regression test for the report-card SCHEME scope advisory lock
// (docs/report-card.md §2, M6a; see `lockReportCardSchemeScope`).
//
// The lock is a real PostgreSQL transaction-scoped advisory lock, so only a
// database can prove the serialization it provides; the M6a integration suite
// covers that. What this file guards, DB-free, is the exact defect that surfaced
// against real PostgreSQL: `pg_advisory_xact_lock(...)` returns `void`, which
// Prisma's `$queryRaw` cannot deserialize (P2010 "Failed to deserialize column
// of type 'void'"), so the call MUST cast the result to a supported type. The
// harness feeds the real function a capturing `$queryRaw`, so it sees the exact
// SQL the service runs.

import type { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"
import { lockReportCardSchemeScope } from "../src/lib/db-locks.js"

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

const PARAMS = {
  schoolId: "school-a",
  academicSessionId: "sess-1",
  classId: "class-1",
  scopeKey: "__CLASS__",
}

describe("lockReportCardSchemeScope (database-free)", () => {
  it("casts the advisory-lock result to a Prisma-decodable type", async () => {
    const { tx, captured } = captureTx()
    await lockReportCardSchemeScope(tx, PARAMS)

    expect(captured).toHaveLength(1)
    const { sql } = captured[0]!
    expect(sql).toContain("pg_advisory_xact_lock")
    // The raw `void` return is not decodable; the cast is the fix.
    expect(sql.trimEnd().endsWith("::text")).toBe(true)
  })

  it("keys the lock on the school and the session:class:scope tuple", async () => {
    const { tx, captured } = captureTx()
    await lockReportCardSchemeScope(tx, PARAMS)

    expect(captured[0]!.values).toEqual(["school-a", "sess-1:class-1:__CLASS__"])
  })
})
