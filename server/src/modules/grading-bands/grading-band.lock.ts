import type { Prisma } from "@prisma/client"

/**
 * School-scoped advisory lock for the ACTIVE grading-band overlap check.
 *
 * The overlap rule is a read-then-write sequence: read the school's active
 * bands, then insert or update. Under PostgreSQL's default READ COMMITTED
 * isolation two concurrent writes can both observe a free range and both
 * commit, leaving two ACTIVE bands that overlap — after which the grade a
 * percentage resolves to depends on row order.
 *
 * A transaction-level advisory lock serializes that check-and-write per
 * school. It is taken BEFORE the overlap query and released when the
 * transaction ends (commit or rollback), so a waiter always re-reads a
 * committed state and then fails the overlap rule.
 */
export function gradingBandLockKey(schoolId: string): number {
  // FNV-1a (32-bit), masked down to a positive 31-bit integer so it fits the
  // `pg_advisory_xact_lock(integer)` overload. A collision only serializes two
  // unrelated schools for the length of one transaction — never a correctness
  // problem.
  let hash = 0x811c9dc5
  for (let index = 0; index < schoolId.length; index += 1) {
    hash ^= schoolId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash & 0x7fffffff
}

/**
 * Takes the school's grading-band lock for the remainder of the transaction.
 * Must be called on the SAME transaction client that performs the overlap
 * check and the write.
 */
export async function lockActiveGradingBands(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<void> {
  const key = gradingBandLockKey(schoolId)
  // `pg_advisory_xact_lock` returns void, so it is wrapped in a derived table
  // that yields a typed column — Prisma cannot deserialize a void column.
  await tx.$queryRaw<{ locked: number }[]>`
    SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${key}::int)) AS lock_call
  `
}
