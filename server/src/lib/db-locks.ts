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
