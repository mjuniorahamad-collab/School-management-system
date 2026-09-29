import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"

/**
 * Bounded-statement bulk writers for the Results module.
 *
 * Why this exists: `putSubjectMarks` and `finalizeExam` used to issue one
 * statement PER STUDENT inside a single interactive transaction. A class of 100
 * therefore cost ~3N+2 sequential network round trips, which overruns Prisma's
 * 5000 ms default interactive-transaction timeout against a remote/pooled
 * PostgreSQL and surfaces as P2028. Each writer below collapses an entire
 * loop into ONE statement, making the transaction's round-trip count constant
 * (O(1)) instead of O(N).
 *
 * Two schema facts drive the SQL here (see migration
 * `20260904205846_create_exams_results`):
 *
 *  1. `ExamMark.id` (`@default(uuid())`) and `ExamMark.updatedAt` / `ExamResult
 *     .updatedAt` (`@updatedAt`) are Prisma CLIENT-side concerns with NO
 *     database default. Raw SQL must supply them or the statement fails NOT
 *     NULL. Ids are generated with Node's `crypto.randomUUID` and a single
 *     `now` is bound for the whole batch so every row in one save shares an
 *     identical timestamp — which is what Prisma's `@updatedAt` does.
 *
 *  2. An untyped `VALUES` list column containing a NULL is inferred as `text`
 *     by PostgreSQL, and assigning text to `DECIMAL`/`BOOLEAN` fails. Every
 *     non-text column in the UPDATE statements is therefore explicitly CAST.
 *     (The plain INSERT needs no casts: its types come from the target table.)
 *
 * All data values are bound parameters via `Prisma.sql` — never interpolated —
 * and Decimals are passed as `Prisma.Decimal` so scale/exactness is preserved.
 */

type TransactionClient = Prisma.TransactionClient

export interface ExamMarkBulkRow {
  examResultId: string
  examSubjectId: string
  obtainedMarks: Prisma.Decimal | null
  isAbsent: boolean
  percentage: Prisma.Decimal | null
  grade: string | null
  isPass: boolean | null
  remarks: string | null
}

export interface ResultAggregateBulkRow {
  id: string
  totalObtained: Prisma.Decimal | null
  totalMaxMarks: Prisma.Decimal | null
  totalPercentage: Prisma.Decimal | null
  grade: string | null
  isPass: boolean | null
  isComplete: boolean
}

export interface ResultRankBulkRow {
  id: string
  rank: number
}

/**
 * Inserts or updates one `ExamMark` per supplied row in a single statement.
 *
 * The conflict target `("examResultId","examSubjectId")` is exactly the unique
 * index `ExamMark_examResultId_examSubjectId_key` that the previous per-row
 * `tx.examMark.upsert({ where: { examResultId_examSubjectId: … } })` used, so
 * uniqueness and upsert semantics are unchanged.
 *
 * `enteredBy` / `enteredAt` are written on INSERT only and deliberately absent
 * from the DO UPDATE list, mirroring the old `create` vs `update` split so
 * first-entry provenance survives later corrections.
 */
export async function bulkUpsertExamMarks(
  tx: TransactionClient,
  params: { schoolId: string; enteredBy: string; rows: readonly ExamMarkBulkRow[] },
): Promise<number> {
  if (params.rows.length === 0) return 0
  const now = new Date()
  const values = Prisma.join(
    params.rows.map(
      (row) =>
        Prisma.sql`(${randomUUID()}, ${params.schoolId}, ${row.examResultId}, ${
          row.examSubjectId
        }, ${row.obtainedMarks}, ${row.isAbsent}, ${row.percentage}, ${row.grade}, ${
          row.isPass
        }, ${row.remarks}, ${params.enteredBy}, ${now}, ${params.enteredBy}, ${now})`,
    ),
  )
  return tx.$executeRaw(
    Prisma.sql`INSERT INTO "ExamMark" ("id", "schoolId", "examResultId", "examSubjectId", "obtainedMarks", "isAbsent", "percentage", "grade", "isPass", "remarks", "enteredBy", "enteredAt", "updatedBy", "updatedAt") VALUES ${values} ON CONFLICT ("examResultId", "examSubjectId") DO UPDATE SET "obtainedMarks" = EXCLUDED."obtainedMarks", "isAbsent" = EXCLUDED."isAbsent", "percentage" = EXCLUDED."percentage", "grade" = EXCLUDED."grade", "isPass" = EXCLUDED."isPass", "remarks" = EXCLUDED."remarks", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = EXCLUDED."updatedAt"`,
  )
}

/**
 * Writes the recomputed student-level aggregate for many results at once.
 * The aggregate VALUES themselves are always produced by the pure
 * `computeResultAggregate`, which remains the single source of grading truth.
 */
export async function bulkUpdateResultAggregates(
  tx: TransactionClient,
  rows: readonly ResultAggregateBulkRow[],
): Promise<number> {
  if (rows.length === 0) return 0
  const now = new Date()
  const values = Prisma.join(
    rows.map(
      (row) =>
        Prisma.sql`(${row.id}, ${row.totalObtained}, ${row.totalMaxMarks}, ${
          row.totalPercentage
        }, ${row.grade}, ${row.isPass}, ${row.isComplete}, ${now})`,
    ),
  )
  return tx.$executeRaw(
    Prisma.sql`UPDATE "ExamResult" AS r SET "totalObtained" = CAST(v."total_obtained" AS DECIMAL(7,2)), "totalMaxMarks" = CAST(v."total_max_marks" AS DECIMAL(7,2)), "totalPercentage" = CAST(v."total_percentage" AS DECIMAL(5,2)), "grade" = v."grade", "isPass" = CAST(v."is_pass" AS BOOLEAN), "isComplete" = CAST(v."is_complete" AS BOOLEAN), "updatedAt" = CAST(v."updated_at" AS TIMESTAMP(3)) FROM (VALUES ${values}) AS v("id", "total_obtained", "total_max_marks", "total_percentage", "grade", "is_pass", "is_complete", "updated_at") WHERE r."id" = v."id"`,
  )
}

/** Assigns competition ranks to many results in a single statement. */
export async function bulkUpdateResultRanks(
  tx: TransactionClient,
  rows: readonly ResultRankBulkRow[],
): Promise<number> {
  if (rows.length === 0) return 0
  const now = new Date()
  const values = Prisma.join(
    rows.map((row) => Prisma.sql`(${row.id}, ${row.rank}, ${now})`),
  )
  return tx.$executeRaw(
    Prisma.sql`UPDATE "ExamResult" AS r SET "rank" = CAST(v."rank" AS INTEGER), "updatedAt" = CAST(v."updated_at" AS TIMESTAMP(3)) FROM (VALUES ${values}) AS v("id", "rank", "updated_at") WHERE r."id" = v."id"`,
  )
}
