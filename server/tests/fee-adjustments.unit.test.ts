import { describe, expect, it } from "vitest"
import {
  ADJUSTMENT_TRANSITIONS,
  assertFinancialReconciliation,
  assertNotSelfApproval,
  assertValidAdjustmentTransition,
  canAdjust,
  canTransitionAdjustmentStatus,
  computeComputedAmount,
  computeNetObligation,
  isSelfApproval,
  reduceInstallments,
  reverseApplication,
  sumAdjustmentAmounts,
} from "../src/modules/fee-adjustments/fee-adjustment.rules.js"
import {
  deriveInstallmentStatus,
  deriveInvoiceStatus,
} from "../src/modules/fee-invoices/fee-invoice.rules.js"

describe("percentage concession computation (database-free)", () => {
  it("computes 10% of ₹40,000 exactly", () => {
    expect(computeComputedAmount("PERCENTAGE", 10, 40000)).toBe(4000)
  })

  it("computes 7.5% of ₹40,000 exactly", () => {
    expect(computeComputedAmount("PERCENTAGE", 7.5, 40000)).toBe(3000)
  })

  it("rounds a fractional cent down at the third decimal", () => {
    // 100.01 × 10% = 10.001 → 10.00
    expect(computeComputedAmount("PERCENTAGE", 10, 100.01)).toBe(10)
  })

  it("rounds a fractional cent up at the third decimal", () => {
    // 100.06 × 10% = 10.006 → 10.01
    expect(computeComputedAmount("PERCENTAGE", 10, 100.06)).toBe(10.01)
  })

  it("avoids float drift around a money boundary", () => {
    // 999.99 × 7.5% = 74.99925 → 75.00
    expect(computeComputedAmount("PERCENTAGE", 7.5, 999.99)).toBe(75)
  })

  it("is unaffected by payment history (pure gross × percentage)", () => {
    // The signature accepts only gross + percentage; payment state cannot
    // influence the frozen computed amount by construction.
    expect(computeComputedAmount("PERCENTAGE", 10, 40000)).toBe(4000)
    expect(computeComputedAmount("PERCENTAGE", 10, 40000)).toBe(4000)
  })

  it("rejects negative and zero percentages", () => {
    expect(() => computeComputedAmount("PERCENTAGE", -10, 40000)).toThrow(/positive amount/)
    expect(() => computeComputedAmount("PERCENTAGE", 0, 40000)).toThrow(/positive amount/)
  })

  it("rejects percentages above 100 (would break net ≥ paid)", () => {
    expect(() => computeComputedAmount("PERCENTAGE", 100.01, 40000)).toThrow(
      /cannot exceed 100/,
    )
    expect(() => computeComputedAmount("PERCENTAGE", 150, 40000)).toThrow(/cannot exceed 100/)
  })

  it("rejects percentages with more than two decimal places", () => {
    expect(() => computeComputedAmount("PERCENTAGE", 7.555, 40000)).toThrow(/two decimal places/)
  })

  it("returns a FIXED_AMOUNT value unchanged after money validation", () => {
    expect(computeComputedAmount("FIXED_AMOUNT", 5000, 40000)).toBe(5000)
    expect(() => computeComputedAmount("FIXED_AMOUNT", -1, 40000)).toThrow(/positive amount/)
  })

  it("rejects an unknown kind", () => {
    expect(() => computeComputedAmount("BOGUS" as never, 10, 40000)).toThrow(/kind/)
  })
})

describe("net obligation calculation (database-free)", () => {
  it("computes net and balance for an unpaid invoice", () => {
    expect(
      computeNetObligation({ grossAmount: 40000, amountPaid: 0, activeAdjustmentAmounts: [5000] }),
    ).toMatchObject({ totalAmount: 35000, balance: 35000, adjustmentTotal: 5000 })
  })

  it("computes net and balance for a partially paid invoice", () => {
    expect(
      computeNetObligation({ grossAmount: 40000, amountPaid: 10000, activeAdjustmentAmounts: [5000] }),
    ).toMatchObject({ totalAmount: 35000, balance: 25000, remainingCapacity: 25000 })
  })

  it("rejects a concession on a fully paid invoice", () => {
    expect(() =>
      computeNetObligation({ grossAmount: 40000, amountPaid: 40000, activeAdjustmentAmounts: [1] }),
    ).toThrow(/exceed the unpaid obligation/)
  })

  it("accepts the exact remaining obligation boundary", () => {
    expect(
      computeNetObligation({ grossAmount: 40000, amountPaid: 39000, activeAdjustmentAmounts: [1000] }),
    ).toMatchObject({ totalAmount: 39000, balance: 0 })
  })

  it("rejects a concession above the remaining obligation", () => {
    expect(() =>
      computeNetObligation({ grossAmount: 40000, amountPaid: 39000, activeAdjustmentAmounts: [1001] }),
    ).toThrow(/exceed the unpaid obligation/)
  })

  it("allows a zero-payment invoice through the cap guard", () => {
    expect(canAdjust(40000, 0, 40000)).toBe(true)
    expect(canAdjust(40000, 0, 40000.01)).toBe(false)
  })

  it("stacks multiple approved adjustments", () => {
    const result = computeNetObligation({
      grossAmount: 40000,
      amountPaid: 10000,
      activeAdjustmentAmounts: [5000, 3000],
    })
    expect(result.adjustmentTotal).toBe(8000)
    expect(result.totalAmount).toBe(32000)
    expect(result.balance).toBe(22000)
  })

  it("rejects a stacked total above the money-exact cap", () => {
    expect(() =>
      computeNetObligation({ grossAmount: 40000, amountPaid: 10000, activeAdjustmentAmounts: [25000, 6000] }),
    ).toThrow(/exceed the unpaid obligation/)
  })

  it("accepts exactly gross - paid and rejects gross - paid + 0.01", () => {
    expect(canAdjust(40000, 10000, 30000)).toBe(true)
    expect(canAdjust(40000, 10000, 30000.01)).toBe(false)
  })

  it("rejects a negative paid amount", () => {
    expect(() =>
      computeNetObligation({ grossAmount: 40000, amountPaid: -1, activeAdjustmentAmounts: [] }),
    ).toThrow(/non-negative/)
  })

  it("rejects negative active adjustment amounts at the sum level", () => {
    expect(sumAdjustmentAmounts([5000, -500])).toBe(4500)
  })
})

describe("FIFO installment reduction (database-free)", () => {
  it("keeps a settled installment untouched", () => {
    const installments = [
      { id: "i1", amount: 15000, amountPaid: 15000, balance: 0, dueDateISO: "2026-04-01", sortOrder: 1 },
      { id: "i2", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-06-01", sortOrder: 2 },
      { id: "i3", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-09-01", sortOrder: 3 },
    ]
    const result = reduceInstallments(5000, installments)
    expect(result.applied).toBe(5000)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({ installmentId: "i2", amountReduced: 5000 })
    expect(result.updated.get("i2")).toEqual({ amount: 5000, amountPaid: 0, balance: 5000 })
    expect(result.updated.has("i1")).toBe(false)
    expect(result.updated.has("i3")).toBe(false)
  })

  it("spans multiple installments FIFO", () => {
    const installments = [
      { id: "i1", amount: 15000, amountPaid: 0, balance: 15000, dueDateISO: "2026-04-01", sortOrder: 1 },
      { id: "i2", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-06-01", sortOrder: 2 },
      { id: "i3", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-09-01", sortOrder: 3 },
    ]
    const result = reduceInstallments(20000, installments)
    expect(result.applied).toBe(20000)
    expect(result.lines.map((line) => [line.installmentId, line.amountReduced])).toEqual([
      ["i1", 15000],
      ["i2", 5000],
    ])
    expect(result.updated.get("i1")).toEqual({ amount: 0, amountPaid: 0, balance: 0 })
    expect(result.updated.get("i2")).toEqual({ amount: 5000, amountPaid: 0, balance: 5000 })
    expect(result.updated.has("i3")).toBe(false)
  })

  it("reduces a partially paid installment only by its outstanding balance", () => {
    const installments = [
      { id: "i1", amount: 10000, amountPaid: 4000, balance: 6000, dueDateISO: "2026-04-01", sortOrder: 1 },
      { id: "i2", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-06-01", sortOrder: 2 },
    ]
    const result = reduceInstallments(8000, installments)
    expect(result.lines.map((line) => [line.installmentId, line.amountReduced])).toEqual([
      ["i1", 6000],
      ["i2", 2000],
    ])
    expect(result.updated.get("i1")).toEqual({ amount: 4000, amountPaid: 4000, balance: 0 })
  })

  it("applies only up to the available outstanding balance", () => {
    const installments = [
      { id: "i1", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-04-01", sortOrder: 1 },
      { id: "i2", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-06-01", sortOrder: 2 },
    ]
    const result = reduceInstallments(25000, installments)
    expect(result.applied).toBe(20000)
    expect(result.lines).toHaveLength(2)
  })

  it("produces no lines when every installment is already paid", () => {
    const installments = [
      { id: "i1", amount: 10000, amountPaid: 10000, balance: 0, dueDateISO: "2026-04-01", sortOrder: 1 },
    ]
    const result = reduceInstallments(5000, installments)
    expect(result.lines).toHaveLength(0)
    expect(result.applied).toBe(0)
  })

  it("rejects zero and negative concessions", () => {
    const installments = [
      { id: "i1", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-04-01", sortOrder: 1 },
    ]
    expect(() => reduceInstallments(0, installments)).toThrow(/positive/)
    expect(() => reduceInstallments(-5, installments)).toThrow(/positive/)
  })

  it("handles a single-installment invoice", () => {
    const installments = [
      { id: "i1", amount: 40000, amountPaid: 10000, balance: 30000, dueDateISO: "2026-04-01", sortOrder: 1 },
    ]
    const result = reduceInstallments(30000, installments)
    expect(result.updated.get("i1")).toEqual({ amount: 10000, amountPaid: 10000, balance: 0 })
    expect(result.lines[0]).toMatchObject({ amountReduced: 30000, amountAfter: 10000, balanceAfter: 0 })
  })
})

describe("FIFO due-date ties (database-free)", () => {
  const installments = [
    { id: "c", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-04-01", sortOrder: 3 },
    { id: "a", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-04-01", sortOrder: 1 },
    { id: "b", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-04-01", sortOrder: 2 },
  ]

  it("breaks equal due dates by sort order ascending", () => {
    const result = reduceInstallments(15000, installments)
    expect(result.lines.map((line) => line.installmentId)).toEqual(["a", "b"])
    expect(result.updated.get("a")).toEqual({ amount: 0, amountPaid: 0, balance: 0 })
    expect(result.updated.get("b")).toEqual({ amount: 5000, amountPaid: 0, balance: 5000 })
  })

  it("returns the same result regardless of input array order", () => {
    const shuffled = [...installments].reverse()
    const a = reduceInstallments(15000, installments)
    const b = reduceInstallments(15000, shuffled)
    expect(a.lines.map((line) => line.installmentId)).toEqual(b.lines.map((line) => line.installmentId))
    for (const line of a.lines) {
      expect(b.lines.find((candidate) => candidate.installmentId === line.installmentId)).toMatchObject({
        amountReduced: line.amountReduced,
      })
    }
  })
})

describe("status derivation reuse (database-free)", () => {
  const T = "2026-09-05"

  it("derives installment PAID once the balance hits zero", () => {
    expect(deriveInstallmentStatus({ amountPaid: 4000, balance: 0, dueDateISO: "2026-10-01" }, T)).toBe("PAID")
  })

  it("keeps unpaid/partial status while a balance remains", () => {
    expect(deriveInstallmentStatus({ amountPaid: 0, balance: 5000, dueDateISO: "2026-10-01" }, T)).toBe("UNPAID")
    expect(deriveInstallmentStatus({ amountPaid: 2000, balance: 3000, dueDateISO: "2026-10-01" }, T)).toBe("PARTIAL")
  })

  it("derives a PAID invoice from fully reduced installments", () => {
    const installments = [
      { id: "i1", amount: 10000, amountPaid: 10000, balance: 0, dueDateISO: "2026-04-01", sortOrder: 1 },
    ]
    const result = reduceInstallments(10000, installments)
    void result
    expect(deriveInvoiceStatus([{ amountPaid: 10000, balance: 0, dueDateISO: "2026-04-01" }], T)).toBe("PAID")
  })
})

describe("status transition rules (database-free)", () => {
  it("defines the exact allowed transition graph", () => {
    expect(ADJUSTMENT_TRANSITIONS.REQUESTED.sort()).toEqual(["APPROVED", "CANCELLED", "REJECTED"].sort())
    expect(ADJUSTMENT_TRANSITIONS.APPROVED).toEqual(["REVERSED"])
    expect(ADJUSTMENT_TRANSITIONS.REJECTED).toEqual([])
    expect(ADJUSTMENT_TRANSITIONS.CANCELLED).toEqual([])
    expect(ADJUSTMENT_TRANSITIONS.REVERSED).toEqual([])
  })

  it("permits REQUESTED → APPROVED / REJECTED / CANCELLED", () => {
    expect(canTransitionAdjustmentStatus("REQUESTED", "APPROVED")).toBe(true)
    expect(canTransitionAdjustmentStatus("REQUESTED", "REJECTED")).toBe(true)
    expect(canTransitionAdjustmentStatus("REQUESTED", "CANCELLED")).toBe(true)
    expect(() => assertValidAdjustmentTransition("REQUESTED", "APPROVED")).not.toThrow()
  })

  it("permits APPROVED → REVERSED only", () => {
    expect(canTransitionAdjustmentStatus("APPROVED", "REVERSED")).toBe(true)
    expect(canTransitionAdjustmentStatus("APPROVED", "REQUESTED")).toBe(false)
    expect(canTransitionAdjustmentStatus("APPROVED", "REJECTED")).toBe(false)
    expect(canTransitionAdjustmentStatus("APPROVED", "CANCELLED")).toBe(false)
  })

  it("rejects returning to REQUESTED/APPROVED from terminal states", () => {
    expect(canTransitionAdjustmentStatus("REJECTED", "APPROVED")).toBe(false)
    expect(canTransitionAdjustmentStatus("CANCELLED", "APPROVED")).toBe(false)
    expect(canTransitionAdjustmentStatus("REVERSED", "APPROVED")).toBe(false)
  })

  it("rejects reversing an already-reversed adjustment", () => {
    expect(canTransitionAdjustmentStatus("REVERSED", "REVERSED")).toBe(false)
    expect(() => assertValidAdjustmentTransition("REVERSED", "REVERSED")).toThrow(/Invalid fee adjustment transition/)
  })

  it("rejects an invalid transition with a descriptive error", () => {
    expect(() => assertValidAdjustmentTransition("APPROVED", "CANCELLED")).toThrow(/APPROVED → CANCELLED/)
  })
})

describe("self-approval rule (database-free)", () => {
  it("rejects a requester approving their own adjustment", () => {
    expect(isSelfApproval("user-1", "user-1")).toBe(true)
    expect(() => assertNotSelfApproval("user-1", "user-1")).toThrow(/cannot approve their own/)
  })

  it("allows a different approver", () => {
    expect(isSelfApproval("user-1", "user-2")).toBe(false)
    expect(() => assertNotSelfApproval("user-1", "user-2")).not.toThrow()
  })

  it("treats null identifiers as non-self", () => {
    expect(isSelfApproval(null, "user-2")).toBe(false)
    expect(isSelfApproval("user-1", null)).toBe(false)
  })

  it("applies identically for every user, including SUPER_ADMIN (role-blind)", () => {
    expect(isSelfApproval("super-admin", "super-admin")).toBe(true)
    expect(() => assertNotSelfApproval("super-admin", "super-admin")).toThrow()
  })
})

describe("reversal calculation (database-free)", () => {
  // Post-concession state (IDs preserved) — what a reversal actually runs on.
  function withUpdated(
    installments: readonly (typeof installments)[number][],
    reduction: ReturnType<typeof reduceInstallments>,
  ) {
    return installments.map((installment) => {
      const updated = reduction.updated.get(installment.id)
      return updated ? { ...installment, ...updated } : { ...installment }
    })
  }

  it("restores exactly the amounts the snapshot recorded", () => {
    const installments = [
      { id: "i1", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-04-01", sortOrder: 1 },
      { id: "i2", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-06-01", sortOrder: 2 },
    ]
    const reduction = reduceInstallments(7000, installments)
    expect(reduction.updated.get("i1")).toEqual({ amount: 3000, amountPaid: 0, balance: 3000 })

    const reversal = reverseApplication(withUpdated(installments, reduction), reduction.lines)
    expect(reversal.restored).toBe(7000)
    expect(reversal.updated.get("i1")).toEqual({ amount: 10000, amountPaid: 0, balance: 10000 })
    expect(reversal.updated.has("i2")).toBe(false)
  })

  it("restores from the snapshot, never from the current structure", () => {
    // The reversal input is only the frozen application snapshot — the current
    // FeeStructure or percentage never enter the calculation.
    const installments = [
      { id: "i1", amount: 5000, amountPaid: 0, balance: 5000, dueDateISO: "2026-04-01", sortOrder: 1 },
    ]
    const snapshot = [
      {
        installmentId: "i1",
        amountReduced: 5000,
        amountBefore: 10000,
        amountAfter: 5000,
        balanceBefore: 10000,
        balanceAfter: 5000,
      },
    ]
    const reversal = reverseApplication(installments, snapshot)
    expect(reversal.restored).toBe(5000)
    expect(reversal.updated.get("i1")).toEqual({ amount: 10000, amountPaid: 0, balance: 10000 })
  })

  it("rejects rebuilding reversal amounts from a recalculated percentage", () => {
    // A client cannot pass a percentage here — the API surface is the snapshot.
    const typed = reverseApplication as (
      installments: readonly { id: string }[],
      application: readonly { installmentId: string; amountReduced: number }[],
    ) => { restored: number }
    const installments = [{ id: "i1", amount: 3000, amountPaid: 0, balance: 3000, dueDateISO: "2026-04-01", sortOrder: 1 }]
    expect(typed(installments, [{ installmentId: "i1", amountReduced: 7000 }]).restored).toBe(7000)
  })

  it("keeps paid amounts untouched through a reversal", () => {
    const installments = [
      { id: "i1", amount: 10000, amountPaid: 3000, balance: 7000, dueDateISO: "2026-04-01", sortOrder: 1 },
    ]
    const reduction = reduceInstallments(5000, installments)
    expect(reduction.updated.get("i1")).toEqual({ amount: 5000, amountPaid: 3000, balance: 2000 })
    const reversal = reverseApplication(withUpdated(installments, reduction), reduction.lines)
    expect(reversal.updated.get("i1")).toEqual({ amount: 10000, amountPaid: 3000, balance: 7000 })
  })
})

describe("financial reconciliation (database-free)", () => {
  const installments = [
    { id: "i1", amount: 15000, amountPaid: 0, balance: 15000, dueDateISO: "2026-04-01", sortOrder: 1 },
    { id: "i2", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-06-01", sortOrder: 2 },
    { id: "i3", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-09-01", sortOrder: 3 },
  ]

  function stateAfterReduction(): Parameters<typeof assertFinancialReconciliation>[0] {
    const reduction = reduceInstallments(5000, installments)
    const reconciled = installments.map((installment) => {
      const updated = reduction.updated.get(installment.id)
      return updated ?? { amount: installment.amount, amountPaid: installment.amountPaid, balance: installment.balance }
    })
    return {
      grossAmount: 35000,
      totalAmount: 30000,
      amountPaid: 0,
      balance: 30000,
      items: [{ amount: 15000 }, { amount: 10000 }, { amount: 10000 }],
      installments: reconciled,
    }
  }

  it("passes for a correctly reduced invoice", () => {
    expect(() => assertFinancialReconciliation(stateAfterReduction())).not.toThrow()
  })

  it("passes for a paid-and-reduced invoice", () => {
    // An installment partially paid before the concession keeps its paid
    // amount; only its outstanding balance is reduced by the concession.
    const installments = [
      { id: "i1", amount: 15000, amountPaid: 10000, balance: 5000, dueDateISO: "2026-04-01", sortOrder: 1 },
      { id: "i2", amount: 10000, amountPaid: 0, balance: 10000, dueDateISO: "2026-06-01", sortOrder: 2 },
    ]
    const reduction = reduceInstallments(5000, installments)
    expect(reduction.updated.get("i1")).toEqual({ amount: 10000, amountPaid: 10000, balance: 0 })
    const state = {
      grossAmount: 25000,
      totalAmount: 20000,
      amountPaid: 10000,
      balance: 10000,
      items: [{ amount: 15000 }, { amount: 10000 }],
      installments: [
        { amount: 10000, amountPaid: 10000, balance: 0 },
        { amount: 10000, amountPaid: 0, balance: 10000 },
      ],
    }
    expect(() => assertFinancialReconciliation(state)).not.toThrow()
  })

  it("recovers the original ledger exactly after reduction + reversal", () => {
    const reduction = reduceInstallments(5000, installments)
    const after = installments.map((installment) => {
      const updated = reduction.updated.get(installment.id)
      return updated ? { ...installment, ...updated } : { ...installment }
    })
    // A reversal runs on the post-concession state using the frozen snapshot.
    const reversal = reverseApplication(after, reduction.lines)
    const reversed = after.map((installment) => {
      const updated = reversal.updated.get(installment.id)
      return updated ? { ...installment, ...updated } : { ...installment }
    })
    expect(() =>
      assertFinancialReconciliation({
        grossAmount: 35000,
        totalAmount: 35000,
        amountPaid: 0,
        balance: 35000,
        items: [{ amount: 35000 }],
        installments: reversed.map((installment) => ({
          amount: installment.amount,
          amountPaid: installment.amountPaid,
          balance: installment.balance,
        })),
      }),
    ).not.toThrow()
    // i1 was reduced to 10000 then restored to 15000.
    expect(reversed.find((installment) => installment.id === "i1")?.amount).toBe(15000)
    expect(reversed.find((installment) => installment.id === "i2")?.amount).toBe(10000)
  })

  it("flags net below paid", () => {
    // Downstream sums all reconcile; the cross-cutting net ≥ paid invariant is
    // the one that detects the violation.
    const state = {
      grossAmount: 35000,
      totalAmount: 30000,
      amountPaid: 31000,
      balance: -1000,
      items: [{ amount: 35000 }],
      installments: [{ amount: 30000, amountPaid: 31000, balance: -1000 }],
    }
    expect(() => assertFinancialReconciliation(state)).toThrow(/cannot be below/)
  })

  it("flags balances that do not sum", () => {
    const state = stateAfterReduction()
    state.installments = state.installments.map((installment, index) =>
      index === 0 ? { ...installment, balance: installment.balance + 1 } : installment,
    )
    expect(() => assertFinancialReconciliation(state)).toThrow(/must sum to the invoice balance/)
  })

  it("flags gross not matching item totals", () => {
    const state = stateAfterReduction()
    state.grossAmount = 35000.01
    expect(() => assertFinancialReconciliation(state)).toThrow(/gross amount must equal/)
  })
})