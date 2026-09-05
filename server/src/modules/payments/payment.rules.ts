import { roundMoney } from "../../lib/money.js"

/**
 * Pure payment rules, kept free of Prisma and I/O so they unit-test without a
 * database. Payment amounts are money-validated at the API boundary (positive,
 * at most two decimals) and rounded with the shared `roundMoney` helper at every
 * step to avoid float drift.
 */

export interface AllocatableInstallment {
  id: string
  amountPaid: number
  balance: number
  dueDateISO: string
  sortOrder: number
}

export interface AllocationLine {
  installmentId: string
  amountApplied: number
}

export function totalOutstandingBalance(installments: readonly { balance: number }[]): number {
  return roundMoney(installments.reduce((sum, installment) => sum + installment.balance, 0))
}

/** Returns true when `amount` would leave an invoice balance (overpayment). */
export function isOverpayment(amount: number, installments: readonly { balance: number }[]): boolean {
  return roundMoney(amount) > totalOutstandingBalance(installments)
}

/**
 * Allocates a payment across an invoice's installments FIFO: the earliest-due
 * outstanding installment is settled first (ties broken by sort order), then
 * the next, until the payment amount is fully applied. Returns the allocation
 * lines in the order that money was applied.
 */
export function allocatePayment(
  amount: number,
  installments: readonly AllocatableInstallment[],
): AllocationLine[] {
  const lines: AllocationLine[] = []

  const pending = installments
    .filter((installment) => roundMoney(installment.balance) > 0)
    .map((installment) => ({ ...installment }))
    .sort(
      (a, b) =>
        a.dueDateISO.localeCompare(b.dueDateISO) || a.sortOrder - b.sortOrder,
    )

  let remaining = roundMoney(amount)
  for (const installment of pending) {
    if (remaining <= 0) break
    const balance = roundMoney(installment.balance)
    const applied = roundMoney(Math.min(balance, remaining))
    if (applied > 0) {
      lines.push({ installmentId: installment.id, amountApplied: applied })
      remaining = roundMoney(remaining - applied)
    }
  }

  return lines
}

/**
 * Computes the post-payment ledger state for every affected installment. Rows
 * not present in the allocation are untouched.
 */
export function applyAllocation(
  installments: readonly AllocatableInstallment[],
  allocation: readonly AllocationLine[],
): Map<string, { amountPaid: number; balance: number }> {
  const result = new Map<string, { amountPaid: number; balance: number }>()
  for (const line of allocation) {
    const installment = installments.find((candidate) => candidate.id === line.installmentId)
    if (!installment) continue
    result.set(installment.id, {
      amountPaid: roundMoney(installment.amountPaid + line.amountApplied),
      balance: roundMoney(installment.balance - line.amountApplied),
    })
  }
  return result
}