import type { InstallmentStatus, InvoiceStatus } from "@prisma/client"
import { roundMoney } from "../../lib/money.js"

/**
 * Pure fee-invoice decision rules. Kept dependency-free (no Prisma, no I/O) so
 * they can be unit-tested without a database. The stored `status` columns are
 * maintained on generation and payment writes; these helpers are also used by
 * the mappers to recompute the *derived* status on read, so an invoice that has
 * quietly become overdue still reports the correct status without a write.
 */

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Formats a `Date` (@db.Date) as "YYYY-MM-DD" using UTC calendar components.
 * Prisma constructs and returns `@db.Date` values as UTC-midnight Date objects,
 * and PostgreSQL DATE columns store the UTC date part of the bound timestamp; a
 * local-component formatter (or a local-midnight parser) drifts by a day on any
 * non-UTC server, so every date here is UTC-canonical. This keeps the string
 * sent by clients (`YYYY-MM-DD`) identical to the string returned to them.
 */
export function toDateISO(value: Date | string): string {
  if (typeof value === "string") return value
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`
}

/** Parses "YYYY-MM-DD" into a UTC-midnight Date for `@db.Date` columns. */
export function parseDateISO(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** Today's date as "YYYY-MM-DD" in the server's local timezone. */
export function todayISODate(now: Date = new Date()): string {
  return toDateISO(now)
}

export interface InstallmentDueInfo {
  amountPaid: number
  balance: number
  dueDateISO: string
}

/** An installment is overdue when its due date has passed and it is unpaid. */
export function isInstallmentOverdue(info: InstallmentDueInfo, todayISO: string): boolean {
  return info.balance > 0 && info.dueDateISO < todayISO
}

export function deriveInstallmentStatus(info: InstallmentDueInfo, todayISO: string): InstallmentStatus {
  if (info.balance <= 0) return "PAID"
  if (isInstallmentOverdue(info, todayISO)) return "OVERDUE"
  return info.amountPaid > 0 ? "PARTIAL" : "UNPAID"
}

/**
 * Invoice status follows its most-imminent outstanding installment: every
 * installment paid in full → PAID; otherwise the earliest unpaid installment
 * governs (OVERDUE > PARTIAL > UNPAID).
 */
export function deriveInvoiceStatus(installments: readonly InstallmentDueInfo[], todayISO: string): InvoiceStatus {
  const pending = installments.filter((installment) => installment.balance > 0)
  if (pending.length === 0) return "PAID"

  const earliest = pending.reduce((a, b) => (a.dueDateISO <= b.dueDateISO ? a : b))
  if (isInstallmentOverdue(earliest, todayISO)) return "OVERDUE"
  return earliest.amountPaid > 0 ? "PARTIAL" : "UNPAID"
}

export function sumInstallmentInputAmounts(installments: readonly { amount: number }[]): number {
  return roundMoney(installments.reduce((sum, installment) => sum + installment.amount, 0))
}

/** The sum of the supplied installment amounts must equal the structure total. */
export function assertInstallmentsMatchTotal(
  totalAmount: number,
  installments: readonly { amount: number }[],
): void {
  if (roundMoney(sumInstallmentInputAmounts(installments)) !== roundMoney(totalAmount)) {
    throw new Error("Installment amounts must add up to the fee structure total")
  }
}