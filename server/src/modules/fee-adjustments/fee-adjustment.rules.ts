import type { FeeAdjustmentKind, FeeAdjustmentStatus } from "@prisma/client"
import { moneySchema, roundMoney } from "../../lib/money.js"
import { sumInstallmentInputAmounts } from "../fee-invoices/fee-invoice.rules.js"

/**
 * Pure fee-adjustment (concession) rules, kept free of Prisma and I/O so they
 * unit-test without a database — the same discipline as payment.rules.ts. The
 * Phase 3 service will orchestrate DB writes around these rules; nothing here
 * reads or writes state, reads the clock, or touches HTTP/auth.
 *
 * Money model (mirrors the Fees/Payments contracts):
 *  - A `FeeInvoice` has `grossAmount` (frozen standard obligation) and
 *    `totalAmount` (current NET obligation = gross − approved concessions).
 *  - Active approved adjustments must never push `net` below `amountPaid`, so
 *    their sum is capped at `grossAmount − amountPaid`.
 *  - Percentage concessions are computed against the frozen `grossAmount` only
 *    (payment history never influences the percentage math) and rounded with
 *    the shared `roundMoney` helper to avoid float drift.
 */

// ────────────────────────────────────────────────────────────────────────────
// Input shapes
// ────────────────────────────────────────────────────────────────────────────

export interface AdjustmentInstallment {
  id: string
  amount: number
  amountPaid: number
  balance: number
  dueDateISO: string
  sortOrder: number
}

export interface InstallmentApplicationLine {
  installmentId: string
  amountReduced: number
  amountBefore: number
  amountAfter: number
  balanceBefore: number
  balanceAfter: number
}

export interface ReductionResult {
  /** Deterministic FIFO application snapshot (persisted as `installmentApplication`). */
  lines: InstallmentApplicationLine[]
  /** Post-reduction ledger for the affected installments only. */
  updated: Map<string, { amount: number; amountPaid: number; balance: number }>
  /** Total money applied (equals the concession amount in valid calls). */
  applied: number
}

// ────────────────────────────────────────────────────────────────────────────
// Rule 1 — percentage concession → frozen monetary amount
// ────────────────────────────────────────────────────────────────────────────

function assertValidMoney(value: number, what: string): number {
  const parsed = moneySchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`${what} must be a positive amount with at most two decimal places`)
  }
  return roundMoney(value)
}

function assertNonNegativeMoney(value: number, what: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${what} must be a non-negative amount`)
  }
  return roundMoney(value)
}

/**
 * Computes the FROZEN monetary amount for an adjustment.
 *
 * - FIXED_AMOUNT → the value itself (money-validated).
 * - PERCENTAGE → round(grossAmount × value ÷ 100), where the percentage is
 *   bounded to (0, 100]: a percentage greater than 100 would always produce a
 *   concession exceeding the gross obligation, violating the net ≥ paid
 *   invariant even on a totally unpaid invoice.
 *
 * Uses the frozen `grossAmount`; `amountPaid`/payment history never enter the
 * percentage math.
 */
export function computeComputedAmount(kind: FeeAdjustmentKind, value: number, grossAmount: number): number {
  const gross = assertValidMoney(grossAmount, "Gross amount")
  if (kind === "FIXED_AMOUNT") {
    return assertValidMoney(value, "Adjustment value")
  }
  if (kind === "PERCENTAGE") {
    const percentage = assertValidMoney(value, "Percentage")
    if (percentage > 100) {
      throw new Error("A percentage concession cannot exceed 100")
    }
    return roundMoney((gross * percentage) / 100)
  }
  throw new Error(`Unsupported adjustment kind: ${kind as string}`)
}

// ────────────────────────────────────────────────────────────────────────────
// Rule 2 & 3 — net obligation, cap validation, multiple adjustments
// ────────────────────────────────────────────────────────────────────────────

export interface NetObligationInput {
  grossAmount: number
  amountPaid: number
  activeAdjustmentAmounts: readonly number[]
}

export interface NetObligationResult {
  grossAmount: number
  totalAmount: number
  adjustmentTotal: number
  balance: number
  remainingCapacity: number
}

/**
 * Sums the active approved concession amounts with money rounding.
 */
export function sumAdjustmentAmounts(amounts: readonly number[]): number {
  return roundMoney(amounts.reduce((sum, amount) => sum + amount, 0))
}

/**
 * Whether an adjustment total would exceed what the frozen invariant allows:
 * active approved adjustments ≤ grossAmount − amountPaid (money-exact).
 */
export function canAdjust(grossAmount: number, amountPaid: number, requestedTotal: number): boolean {
  const gross = roundMoney(grossAmount)
  const paid = roundMoney(amountPaid)
  const requested = roundMoney(requestedTotal)
  return requested <= roundMoney(gross - paid)
}

/**
 * Computes net obligation and balance, enforcing the frozen invariant
 * (net = gross − active adjustments must stay ≥ amountPaid ≥ 0). Throws when
 * the cap is exceeded; use `canAdjust` when a boolean is preferred.
 */
export function computeNetObligation(input: NetObligationInput): NetObligationResult {
  const gross = assertValidMoney(input.grossAmount, "Gross amount")
  const paid = assertNonNegativeMoney(input.amountPaid, "Paid amount")
  const adjustmentTotal = sumAdjustmentAmounts(input.activeAdjustmentAmounts)

  const capacity = roundMoney(gross - paid)
  if (adjustmentTotal > capacity) {
    throw new Error("Approved adjustments exceed the unpaid obligation on this invoice")
  }

  const totalAmount = roundMoney(gross - adjustmentTotal)
  const balance = roundMoney(totalAmount - paid)
  return { grossAmount: gross, totalAmount, adjustmentTotal, balance, remainingCapacity: roundMoney(capacity - adjustmentTotal) }
}

// ────────────────────────────────────────────────────────────────────────────
// Rules 4, 5 & 6 — FIFO installment reduction (deterministic)
// ────────────────────────────────────────────────────────────────────────────

/**
 * FIFO per-installment concession application:
 *   1. only installments with an outstanding balance participate;
 *   2. ordered by due date ascending, then sort order ascending;
 *   3. `id` is the final tie-break so the result is total and independent of
 *      the caller's array order;
 *   4. an installment absorbs at most its current outstanding balance, so
 *      already-settled portions are never touched.
 *
 * Reducing an installment lowers its `amount` (obligation) and `balance` by
 * the applied money; `amountPaid` is never changed by a concession.
 */
export function reduceInstallments(amount: number, installments: readonly AdjustmentInstallment[]): ReductionResult {
  const total = roundMoney(amount)
  if (total <= 0) throw new Error("Concession amount must be positive")

  const pending = installments
    .filter((installment) => roundMoney(installment.balance) > 0)
    .map((installment) => ({ ...installment }))
    .sort(
      (a, b) =>
        a.dueDateISO.localeCompare(b.dueDateISO) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    )

  const lines: InstallmentApplicationLine[] = []
  const updated = new Map<string, { amount: number; amountPaid: number; balance: number }>()
  let remaining = total
  for (const installment of pending) {
    if (remaining <= 0) break
    const balance = roundMoney(installment.balance)
    const amount = roundMoney(installment.amount)
    const applied = roundMoney(Math.min(balance, remaining))
    if (applied <= 0) continue
    const amountAfter = roundMoney(amount - applied)
    const balanceAfter = roundMoney(balance - applied)
    lines.push({
      installmentId: installment.id,
      amountReduced: applied,
      amountBefore: amount,
      amountAfter,
      balanceBefore: balance,
      balanceAfter,
    })
    updated.set(installment.id, { amount: amountAfter, amountPaid: roundMoney(installment.amountPaid), balance: balanceAfter })
    remaining = roundMoney(remaining - applied)
  }

  return { lines, updated, applied: roundMoney(total - remaining) }
}

// ────────────────────────────────────────────────────────────────────────────
// Rule 10 — reversal restores exactly what the snapshot recorded
// ────────────────────────────────────────────────────────────────────────────

export interface ReversalLine {
  installmentId: string
  amountRestored: number
  amountBefore: number
  amountAfter: number
  balanceBefore: number
  balanceAfter: number
}

export interface ReversalResult {
  lines: ReversalLine[]
  updated: Map<string, { amount: number; amountPaid: number; balance: number }>
  restored: number
}

/**
 * Restores the exact amounts a previous concession removed, sourced ONLY from
 * the immutable `installmentApplication` snapshot (never recomputed from the
 * current FeeStructure or the original percentage). Amount and balance are
 * re-added; `amountPaid` is untouched throughout — a reversal never refunds.
 */
export function reverseApplication(
  installments: readonly AdjustmentInstallment[],
  application: readonly InstallmentApplicationLine[],
): ReversalResult {
  const byId = new Map(installments.map((installment) => [installment.id, installment]))
  const lines: ReversalLine[] = []
  const updated = new Map<string, { amount: number; amountPaid: number; balance: number }>()
  let restored = 0

  for (const line of application) {
    const installment = byId.get(line.installmentId)
    if (!installment) continue
    const restore = roundMoney(line.amountReduced)
    if (restore <= 0) continue
    const amountBefore = roundMoney(installment.amount)
    const balanceBefore = roundMoney(installment.balance)
    const amountAfter = roundMoney(amountBefore + restore)
    const balanceAfter = roundMoney(balanceBefore + restore)
    lines.push({ installmentId: installment.id, amountRestored: restore, amountBefore, amountAfter, balanceBefore, balanceAfter })
    updated.set(installment.id, { amount: amountAfter, amountPaid: roundMoney(installment.amountPaid), balance: balanceAfter })
    restored = roundMoney(restored + restore)
  }

  return { lines, updated, restored }
}

// ────────────────────────────────────────────────────────────────────────────
// Rule 7 & 8 — status derivation & transitions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Legal FeeAdjustment lifecycle edges. REQUESTED may be approved, rejected or
 * cancelled; an APPROVED concession may only be reversed (reversal is a
 * compensating record — an original that has been reversed must never be
 * reversed again). Nothing ever returns to REQUESTED/APPROVED from a terminal
 * state.
 */
export const ADJUSTMENT_TRANSITIONS: Record<FeeAdjustmentStatus, readonly FeeAdjustmentStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["REVERSED"],
  REJECTED: [],
  CANCELLED: [],
  REVERSED: [],
}

export function canTransitionAdjustmentStatus(from: FeeAdjustmentStatus, to: FeeAdjustmentStatus): boolean {
  return ADJUSTMENT_TRANSITIONS[from].includes(to)
}

export function assertValidAdjustmentTransition(from: FeeAdjustmentStatus, to: FeeAdjustmentStatus): void {
  if (!canTransitionAdjustmentStatus(from, to)) {
    throw new Error(`Invalid fee adjustment transition: ${from} → ${to}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Rule 9 — self-approval is never allowed
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rejects approval by the adjustment's requester. Applies to EVERY user
 * including SUPER_ADMIN. (The audited SUPER_ADMIN override is a separate,
 * explicit action modelled in Phase 3 — it is NOT implemented here, and even
 * then it may only act on another user's request.)
 */
export function isSelfApproval(requestedById: string | null, approverId: string | null): boolean {
  if (requestedById == null || approverId == null) return false
  return requestedById === approverId
}

export function assertNotSelfApproval(requestedById: string | null, approverId: string | null): void {
  if (isSelfApproval(requestedById, approverId)) {
    throw new Error("An adjustment requester cannot approve their own concession")
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Rule 11 — financial reconciliation
// ────────────────────────────────────────────────────────────────────────────

export interface FinancialState {
  grossAmount: number
  totalAmount: number
  amountPaid: number
  balance: number
  items: readonly { amount: number }[]
  installments: readonly { amount: number; amountPaid: number; balance: number }[]
}

/**
 * Asserts the full set of cross-cutting money invariants after any concession
 * application or reversal. Throws on the first violation; every comparison is
 * money-exact via `roundMoney`.
 */
export function assertFinancialReconciliation(state: FinancialState): void {
  const gross = roundMoney(state.grossAmount)
  const total = roundMoney(state.totalAmount)
  const paid = roundMoney(state.amountPaid)
  const balance = roundMoney(state.balance)

  if (roundMoney(state.items.reduce((sum, item) => sum + item.amount, 0)) !== gross) {
    throw new Error("Invoice gross amount must equal the sum of its items")
  }
  if (sumInstallmentInputAmounts(state.installments) !== total) {
    throw new Error("Installment amounts must sum to the invoice total")
  }
  if (roundMoney(state.installments.reduce((sum, installment) => sum + installment.amountPaid, 0)) !== paid) {
    throw new Error("Installment paid amounts must sum to the invoice paid amount")
  }
  if (roundMoney(state.installments.reduce((sum, installment) => sum + installment.balance, 0)) !== balance) {
    throw new Error("Installment balances must sum to the invoice balance")
  }
  if (balance !== roundMoney(total - paid)) {
    throw new Error("Invoice balance must equal total minus paid")
  }
  if (total > gross) {
    throw new Error("Net obligation cannot exceed the gross obligation")
  }
  if (total < paid) {
    throw new Error("Net obligation cannot be below the amount already paid")
  }
  if (paid < 0) {
    throw new Error("Amount paid cannot be negative")
  }
}