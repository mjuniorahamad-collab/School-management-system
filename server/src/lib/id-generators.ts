// Shared server-generated number serialization for per-school sequences.
//
// These follow the same convention as the module generators (admission numbers,
// teacher/staff employee ids): the server owns the sequence via an atomic
// per-school counter and exposes a pure formatting helper. Uniqueness for the
// relevant documents is additionally enforced by `@@unique([schoolId, <number>])`
// indexes in the schema.

/**
 * Formats a zero-padded `prefix-YEAR-####` sequence number.
 * Throws for non-positive/non-safe integers (same contract as module builders).
 */
export function buildYearlyNumber(prefix: string, year: number, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid ${prefix} sequence "${sequence}"`)
  }
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`
}

/** Fee receipt number format, e.g. `RCT-2026-0001`. */
export const RECEIPT_PREFIX = "RCT"
export function buildReceiptNumber(year: number, sequence: number): string {
  return buildYearlyNumber(RECEIPT_PREFIX, year, sequence)
}

/** Fee invoice number format, e.g. `INV-2026-0001`. */
export const INVOICE_PREFIX = "INV"
export function buildInvoiceNumber(year: number, sequence: number): string {
  return buildYearlyNumber(INVOICE_PREFIX, year, sequence)
}

/** Fee payment number format, e.g. `PAY-2026-0001`. */
export const PAYMENT_PREFIX = "PAY"
export function buildPaymentNumber(year: number, sequence: number): string {
  return buildYearlyNumber(PAYMENT_PREFIX, year, sequence)
}

/** Admission application number format, e.g. `APP-2026-0001`. */
export const ADMISSION_APPLICATION_PREFIX = "APP"
export function buildAdmissionApplicationNumber(year: number, sequence: number): string {
  return buildYearlyNumber(ADMISSION_APPLICATION_PREFIX, year, sequence)
}
