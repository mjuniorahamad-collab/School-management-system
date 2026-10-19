import { Prisma } from "@prisma/client"

/**
 * Canonical financial-state serialization point.
 *
 * Every code path that mutates an invoice's financial state (payments,
 * concessions/approvals, reversals) MUST call this FIRST inside its interactive
 * transaction, then re-read the invoice + installments and compute from that
 * authoritative, locked state. PostgreSQL holds the row lock until the
 * transaction commits or rolls back, so concurrent writers to the same invoice
 * serialize (the loser blocks, then re-reads the committed state). Different
 * invoices lock different rows and remain independently processable.
 *
 * A single lock order is preserved across every writer: FeeInvoice is always
 * locked before any FeeAdjustment row, which prevents lock cycles.
 */
export async function lockInvoiceForUpdate(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  schoolId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "FeeInvoice" WHERE "id" = ${invoiceId} AND "schoolId" = ${schoolId} FOR UPDATE`
}

/**
 * Canonical attendance/placement/calendar serialization point.
 *
 * Every code path that can change a register's expected roster or its
 * completeness (attendance record create/update/delete, register
 * open/submit/verify, placement-period create/transfer/correct, and calendar
 * changes that reopen registers) MUST call this FIRST inside its interactive
 * transaction, before reading the roster or mutating anything.
 *
 * The row lock is on the AcademicSession — a row that always exists for every
 * affected scope. Holding it until commit means concurrent writers to the same
 * session serialize (the loser blocks, then re-reads the committed state), so a
 * verification can never race a roster/calendar change and a record write can
 * never slip in behind a SUBMITTED/VERIFIED register. Different sessions lock
 * different rows and remain independently processable.
 *
 * There is exactly one lock, always acquired first, so the lock order across
 * every writer is trivially consistent and no cycle is possible.
 */
export async function lockSessionForUpdate(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; academicSessionId: string },
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "AcademicSession" WHERE "id" = ${params.academicSessionId} AND "schoolId" = ${params.schoolId} FOR UPDATE`
}

/**
 * Canonical report-card GENERATION serialization point (docs/report-card.md §8).
 *
 * Report-card generation INSERTs a new DRAFT version, so the ReportCard scope
 * lock below cannot serialize it: that lock only locks rows that already exist,
 * and a student's very first generation (or any generation racing another
 * generation before either commits) has no rows to lock. The StudentEnrollment
 * row is the always-existing anchor for exactly one generation scope — one row
 * per (student, academic session), validated to exist before generation may
 * proceed — and `StudentEnrollment` is never deleted anywhere in the codebase.
 *
 * Every code path that generates a report card MUST call this inside its
 * interactive transaction before reading the active draft, the previous
 * version, or anything used to compute the new version, and hold it until
 * commit. Concurrent generations for the same scope then serialize: the loser
 * blocks, then re-reads committed state and sees the winner's DRAFT (→ the
 * existing "draft already exists" conflict) instead of interleaving into a
 * second DRAFT with broken supersession bookkeeping. Different students lock
 * different enrollment rows and remain independently processable.
 *
 * Lock order: this anchor is a single lock and is the only lock generation
 * takes. No other code path locks `StudentEnrollment` rows (placement transfer
 * holds the session lock and updates the row), and no holder of the ReportCard
 * scope lock ever requests this row, so no lock cycle is possible.
 */
export async function lockStudentEnrollmentForUpdate(
  tx: Prisma.TransactionClient,
  params: { studentId: string; academicSessionId: string },
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "StudentEnrollment" WHERE "studentId" = ${params.studentId} AND "academicSessionId" = ${params.academicSessionId} FOR UPDATE`
}

/**
 * Canonical report-card lifecycle serialization point (docs/report-card.md §9).
 *
 * Every code path that moves a report card's version status for a student —
 * publication (DRAFT → PENDING_ARCHIVE), issuance + supersession of the previous
 * version (PENDING_ARCHIVE → ISSUED, siblings → SUPERSEDED), and PDF archive
 * attach/replace (including the compensation that discards a rolled-back upload)
 * — MUST call this FIRST inside its interactive transaction, then re-read the
 * card and its archive from that authoritative, locked state.
 *
 * The lock covers every version of ONE (school, academic session, student) scope
 * at once, which is exactly the invariant that matters: only one version of a
 * student's card may ever be ISSUED, and issuing one must demote the others. Two
 * concurrent writers for the same scope therefore serialize (the loser blocks,
 * then re-reads committed state and sees the transition already applied → 409 or
 * idempotent success), while different students lock disjoint row sets and stay
 * independently processable.
 *
 * The lock covers the versions that exist when it is taken; generation only
 * INSERTs a new DRAFT row and never moves a published version, so it does not
 * take this lock — it serializes concurrent generations through the
 * always-existing StudentEnrollment anchor instead (see
 * `lockStudentEnrollmentForUpdate`), because a scope with no rows yet has
 * nothing for this lock to protect.
 *
 * Rows are always locked in `version` order, so two transactions locking
 * overlapping scopes take them in the same order and no lock cycle is possible.
 * No other code path locks `ReportCard` rows, so this is the only lock order
 * that has to be agreed for the table.
 */
export async function lockReportCardStudentScopeForUpdate(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; academicSessionId: string; studentId: string },
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "ReportCard" WHERE "schoolId" = ${params.schoolId} AND "academicSessionId" = ${params.academicSessionId} AND "studentId" = ${params.studentId} ORDER BY "version" FOR UPDATE`
}

/**
 * Canonical report-card SCHEME configuration serialization point
 * (docs/report-card.md §2, M6a).
 *
 * A scheme upsert must classify its audit action (CREATE vs UPDATE) from the
 * committed state, never from a possibly-stale pre-upsert read: two concurrent
 * first-time upserts for the same scope must not both audit CREATE, and an
 * update must never be recorded as a creation. A scheme is identified by its
 * natural scope `(schoolId, academicSessionId, classId, scopeKey)`, but the row
 * may not exist yet, so no row lock can serialize the first writer.
 *
 * This takes a transaction-scoped ADVISORY lock keyed on the scope instead: the
 * scope is known before the row exists, so there is always a key to lock, and
 * PostgreSQL releases it automatically at commit/rollback. Every code path that
 * upserts a scheme MUST call this FIRST inside its interactive transaction, then
 * read the scheme for that scope and classify create-vs-update from that
 * authoritative, serialized view. Concurrent writers for the same scope
 * serialize (the loser blocks, then re-reads the committed row and correctly
 * classifies UPDATE), while different scopes hash to different keys and remain
 * independently processable. A hash collision between two unrelated scopes only
 * causes harmless extra serialization, never an incorrect classification.
 *
 * This lock is taken only by scheme configuration; it is a single lock and
 * therefore cannot form a cycle with the row locks above.
 *
 * `pg_advisory_xact_lock` returns `void`, which Prisma's `$queryRaw` cannot
 * deserialize (it throws P2010 "Failed to deserialize column of type 'void'").
 * The result is therefore cast to `text`, which Prisma decodes. The cast changes
 * only the type of the returned value, never the lock: the same two-argument
 * `pg_advisory_xact_lock` call is still evaluated, so the transaction-scoped
 * lock is genuinely acquired and held until commit/rollback exactly as before.
 */
export async function lockReportCardSchemeScope(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; academicSessionId: string; classId: string; scopeKey: string },
): Promise<void> {
  const scope = `${params.academicSessionId}:${params.classId}:${params.scopeKey}`
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${params.schoolId}), hashtext(${scope}))::text`
}
