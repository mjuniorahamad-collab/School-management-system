import { describe, expect, it } from "vitest"
import {
  assertFinancialReconciliation,
  canAdjust,
  computeComputedAmount,
  computeNetObligation,
  reduceInstallments,
  reverseApplication,
  sumAdjustmentAmounts,
} from "../src/modules/fee-adjustments/fee-adjustment.rules.js"
import type {
  AdjustmentInstallment,
  FinancialState,
  InstallmentApplicationLine,
} from "../src/modules/fee-adjustments/fee-adjustment.rules.js"
import { roundMoney } from "../src/lib/money.js"
import { createRng } from "./helpers/seeded-random.js"

// Independent calculation-verification suite for the pure fee-adjustment
// (concession) rules. Complements fee-adjustments.unit.test.ts with rounding
// boundaries, the negative-adjustment hole, FIFO id tie-breaking, reversal
// round-trips, and every reconciliation invariant.

function inst(
  id: string,
  amount: number,
  amountPaid: number,
  dueDateISO: string,
  sortOrder: number,
): AdjustmentInstallment {
  return { id, amount, amountPaid, balance: roundMoney(amount - amountPaid), dueDateISO, sortOrder }
}

describe("computeComputedAmount (calculation)", () => {
  it("computes a whole-number percentage concession", () => {
    expect(computeComputedAmount("PERCENTAGE", 50, 40000)).toBe(20000)
  })

  it("allows a full 100% concession", () => {
    expect(computeComputedAmount("PERCENTAGE", 100, 40000)).toBe(40000)
  })

  it("computes a fractional percentage exactly", () => {
    expect(computeComputedAmount("PERCENTAGE", 33.33, 10000)).toBe(3333)
  })

  it("rounds a percentage of a fractional gross up to the cent", () => {
    expect(computeComputedAmount("PERCENTAGE", 7.5, 999.99)).toBe(75)
  })

  it("rounds 10% of 100.05 up to 10.01", () => {
    expect(computeComputedAmount("PERCENTAGE", 10, 100.05)).toBe(10.01)
  })

  it("rounds 10% of 100.01 down to 10", () => {
    expect(computeComputedAmount("PERCENTAGE", 10, 100.01)).toBe(10)
  })

  it("rounds 10% of 100.06 up to 10.01", () => {
    expect(computeComputedAmount("PERCENTAGE", 10, 100.06)).toBe(10.01)
  })

  it("rejects zero and negative percentages", () => {
    expect(() => computeComputedAmount("PERCENTAGE", 0, 40000)).toThrow(/positive amount/)
    expect(() => computeComputedAmount("PERCENTAGE", -10, 40000)).toThrow(/positive amount/)
  })

  it("rejects a percentage above 100 (would break net >= paid)", () => {
    expect(() => computeComputedAmount("PERCENTAGE", 100.01, 40000)).toThrow(/cannot exceed 100/)
    expect(() => computeComputedAmount("PERCENTAGE", 150, 40000)).toThrow(/cannot exceed 100/)
  })

  it("rejects a percentage with more than two decimals", () => {
    expect(() => computeComputedAmount("PERCENTAGE", 7.555, 40000)).toThrow(/two decimal places/)
  })

  it("returns a FIXED_AMOUNT unchanged after money validation", () => {
    expect(computeComputedAmount("FIXED_AMOUNT", 5000, 40000)).toBe(5000)
  })

  it("rejects zero and negative fixed amounts", () => {
    expect(() => computeComputedAmount("FIXED_AMOUNT", 0, 40000)).toThrow(/positive amount/)
  })

  it("rejects a zero or negative gross amount", () => {
    expect(() => computeComputedAmount("PERCENTAGE", 10, 0)).toThrow(/positive amount/)
    expect(() => computeComputedAmount("PERCENTAGE", 10, -100)).toThrow(/positive amount/)
  })

  it("rejects an unknown adjustment kind", () => {
    expect(() => computeComputedAmount("BOGUS" as never, 10, 40000)).toThrow(/kind/)
  })
})

describe("sumAdjustmentAmounts (calculation)", () => {
  it("returns 0 for an empty list", () => {
    expect(sumAdjustmentAmounts([])).toBe(0)
  })

  it("sums repeating thirds to an exact whole", () => {
    expect(sumAdjustmentAmounts([3333.33, 3333.33, 3333.34])).toBe(10000)
  })

  it("rounds a classic 0.1 + 0.2 float sum", () => {
    expect(sumAdjustmentAmounts([0.1, 0.2])).toBe(0.3)
  })

  it("sums a mixed-sign list (no per-item sign guard)", () => {
    expect(sumAdjustmentAmounts([5000, -500])).toBe(4500)
  })

  it("returns a single amount unchanged", () => {
    expect(sumAdjustmentAmounts([250])).toBe(250)
  })
})

describe("canAdjust (calculation)", () => {
  it("permits a concession exactly equal to the unpaid obligation", () => {
    expect(canAdjust(40000, 0, 40000)).toBe(true)
  })

  it("rejects one cent above the unpaid obligation", () => {
    expect(canAdjust(40000, 0, 40000.01)).toBe(false)
  })

  it("permits exactly gross minus paid", () => {
    expect(canAdjust(40000, 10000, 30000)).toBe(true)
  })

  it("rejects one cent above gross minus paid", () => {
    expect(canAdjust(40000, 10000, 30000.01)).toBe(false)
  })

  it("permits a zero concession on a zero invoice", () => {
    expect(canAdjust(0, 0, 0)).toBe(true)
  })

  it("rejects a positive concession on a zero invoice", () => {
    expect(canAdjust(0, 0, 0.01)).toBe(false)
  })

  it("rejects any concession once paid exceeds gross", () => {
    expect(canAdjust(100, 150, 0)).toBe(false)
  })
})

describe("computeNetObligation (calculation)", () => {
  it("computes net and balance with no adjustments", () => {
    expect(computeNetObligation({ grossAmount: 40000, amountPaid: 0, activeAdjustmentAmounts: [] })).toEqual({
      grossAmount: 40000,
      totalAmount: 40000,
      adjustmentTotal: 0,
      balance: 40000,
      remainingCapacity: 40000,
    })
  })

  it("computes net and balance for a partially paid invoice", () => {
    expect(
      computeNetObligation({ grossAmount: 40000, amountPaid: 10000, activeAdjustmentAmounts: [5000] }),
    ).toMatchObject({ totalAmount: 35000, balance: 25000, remainingCapacity: 25000 })
  })

  it("accepts the exact remaining obligation boundary", () => {
    expect(
      computeNetObligation({ grossAmount: 40000, amountPaid: 39000, activeAdjustmentAmounts: [1000] }),
    ).toMatchObject({ totalAmount: 39000, balance: 0, remainingCapacity: 0 })
  })

  it("rejects a concession above the remaining obligation", () => {
    expect(() =>
      computeNetObligation({ grossAmount: 40000, amountPaid: 39000, activeAdjustmentAmounts: [1001] }),
    ).toThrow(/exceed the unpaid obligation/)
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

  it("sums repeating thirds to a zero net obligation", () => {
    expect(
      computeNetObligation({ grossAmount: 10000, amountPaid: 0, activeAdjustmentAmounts: [3333.33, 3333.33, 3333.34] }),
    ).toMatchObject({ totalAmount: 0, balance: 0, remainingCapacity: 0 })
  })

  it("rejects a negative active adjustment amount instead of inflating net", () => {
    // FIXED: each active concession is validated as a finite, non-negative money
    // amount before summing, so a negative one can never push net above gross.
    expect(() =>
      computeNetObligation({ grossAmount: 10000, amountPaid: 0, activeAdjustmentAmounts: [-1000] }),
    ).toThrow(/non-negative/)
  })

  it("rejects a non-finite active adjustment amount", () => {
    expect(() =>
      computeNetObligation({ grossAmount: 10000, amountPaid: 0, activeAdjustmentAmounts: [Number.NaN] }),
    ).toThrow(/non-negative/)
  })

  it("rejects a negative paid amount", () => {
    expect(() =>
      computeNetObligation({ grossAmount: 40000, amountPaid: -1, activeAdjustmentAmounts: [] }),
    ).toThrow(/non-negative/)
  })

  it("accepts a zero paid amount and a zero adjustment", () => {
    expect(computeNetObligation({ grossAmount: 40000, amountPaid: 0, activeAdjustmentAmounts: [0] })).toMatchObject({
      totalAmount: 40000,
      balance: 40000,
    })
  })
})

describe("reduceInstallments (calculation)", () => {
  it("rejects a zero concession", () => {
    expect(() => reduceInstallments(0, [inst("i1", 100, 0, "2026-04-01", 1)])).toThrow(/positive/)
  })

  it("rejects a negative concession", () => {
    expect(() => reduceInstallments(-5, [inst("i1", 100, 0, "2026-04-01", 1)])).toThrow(/positive/)
  })

  it("returns no lines for an empty ledger but a positive concession", () => {
    const result = reduceInstallments(100, [])
    expect(result.lines).toEqual([])
    expect(result.updated.size).toBe(0)
    expect(result.applied).toBe(0)
  })

  it("leaves a settled installment untouched and reduces the next", () => {
    const result = reduceInstallments(5000, [
      inst("i1", 15000, 15000, "2026-04-01", 1),
      inst("i2", 10000, 0, "2026-06-01", 2),
      inst("i3", 10000, 0, "2026-09-01", 3),
    ])
    expect(result.applied).toBe(5000)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({ installmentId: "i2", amountReduced: 5000 })
    expect(result.updated.get("i2")).toEqual({ amount: 5000, amountPaid: 0, balance: 5000 })
    expect(result.updated.has("i1")).toBe(false)
    expect(result.updated.has("i3")).toBe(false)
  })

  it("spans multiple installments FIFO", () => {
    const result = reduceInstallments(20000, [
      inst("i1", 15000, 0, "2026-04-01", 1),
      inst("i2", 10000, 0, "2026-06-01", 2),
      inst("i3", 10000, 0, "2026-09-01", 3),
    ])
    expect(result.lines.map((line) => [line.installmentId, line.amountReduced])).toEqual([
      ["i1", 15000],
      ["i2", 5000],
    ])
  })

  it("reduces a partially paid installment only by its outstanding balance", () => {
    const result = reduceInstallments(8000, [inst("i1", 10000, 4000, "2026-04-01", 1), inst("i2", 10000, 0, "2026-06-01", 2)])
    expect(result.lines.map((line) => [line.installmentId, line.amountReduced])).toEqual([
      ["i1", 6000],
      ["i2", 2000],
    ])
    expect(result.updated.get("i1")).toEqual({ amount: 4000, amountPaid: 4000, balance: 0 })
  })

  it("applies only up to the available outstanding balance", () => {
    const result = reduceInstallments(25000, [inst("i1", 10000, 0, "2026-04-01", 1), inst("i2", 10000, 0, "2026-06-01", 2)])
    expect(result.applied).toBe(20000)
    expect(result.lines).toHaveLength(2)
  })

  it("breaks equal due dates and sort orders by ascending id", () => {
    const result = reduceInstallments(15000, [
      inst("b", 10000, 0, "2026-04-01", 1),
      inst("a", 10000, 0, "2026-04-01", 1),
    ])
    expect(result.lines.map((line) => line.installmentId)).toEqual(["a", "b"])
    expect(result.updated.get("a")).toEqual({ amount: 0, amountPaid: 0, balance: 0 })
    expect(result.updated.get("b")).toEqual({ amount: 5000, amountPaid: 0, balance: 5000 })
  })

  it("never changes amountPaid", () => {
    const result = reduceInstallments(3000, [inst("i1", 10000, 4000, "2026-04-01", 1)])
    expect(result.updated.get("i1")).toEqual({ amount: 7000, amountPaid: 4000, balance: 3000 })
  })

  it("reduces a float balance exactly", () => {
    const result = reduceInstallments(0.3, [inst("i1", 0.3, 0, "2026-04-01", 1)])
    expect(result.applied).toBe(0.3)
    expect(result.updated.get("i1")).toEqual({ amount: 0, amountPaid: 0, balance: 0 })
  })
})

describe("reverseApplication (calculation)", () => {
  it("restores nothing for an empty application", () => {
    const result = reverseApplication([inst("i1", 100, 0, "2026-04-01", 1)], [])
    expect(result.restored).toBe(0)
    expect(result.updated.size).toBe(0)
  })

  it("skips an application line for an unknown installment", () => {
    const result = reverseApplication([inst("i1", 100, 0, "2026-04-01", 1)], [
      { installmentId: "zzz", amountReduced: 5, amountBefore: 100, amountAfter: 95, balanceBefore: 100, balanceAfter: 95 },
    ])
    expect(result.restored).toBe(0)
  })

  it("skips zero and negative application lines", () => {
    const result = reverseApplication([inst("i1", 100, 0, "2026-04-01", 1)], [
      { installmentId: "i1", amountReduced: 0, amountBefore: 100, amountAfter: 100, balanceBefore: 100, balanceAfter: 100 },
      { installmentId: "i1", amountReduced: -5, amountBefore: 100, amountAfter: 105, balanceBefore: 100, balanceAfter: 105 },
    ])
    expect(result.restored).toBe(0)
  })

  it("restores exactly the amounts the snapshot recorded", () => {
    const installments = [inst("i1", 10000, 0, "2026-04-01", 1), inst("i2", 10000, 0, "2026-06-01", 2)]
    const reduction = reduceInstallments(7000, installments)
    const after = installments.map((row) => {
      const updated = reduction.updated.get(row.id)
      return updated ? { ...row, ...updated } : { ...row }
    })
    const reversal = reverseApplication(after, reduction.lines)
    expect(reversal.restored).toBe(7000)
    expect(reversal.updated.get("i1")).toEqual({ amount: 10000, amountPaid: 0, balance: 10000 })
    expect(reversal.updated.has("i2")).toBe(false)
  })

  it("accumulates restored totals across multiple lines", () => {
    const application: InstallmentApplicationLine[] = [
      { installmentId: "i1", amountReduced: 3000, amountBefore: 10000, amountAfter: 7000, balanceBefore: 10000, balanceAfter: 7000 },
      { installmentId: "i2", amountReduced: 4000, amountBefore: 10000, amountAfter: 6000, balanceBefore: 10000, balanceAfter: 6000 },
    ]
    const result = reverseApplication([inst("i1", 7000, 0, "2026-04-01", 1), inst("i2", 6000, 0, "2026-06-01", 2)], application)
    expect(result.restored).toBe(7000)
    expect(result.updated.get("i1")).toEqual({ amount: 10000, amountPaid: 0, balance: 10000 })
    expect(result.updated.get("i2")).toEqual({ amount: 10000, amountPaid: 0, balance: 10000 })
  })
})

describe("assertFinancialReconciliation (calculation)", () => {
  function validState(): FinancialState {
    return {
      grossAmount: 10000,
      totalAmount: 8000,
      amountPaid: 3000,
      balance: 5000,
      items: [{ amount: 10000 }],
      installments: [{ amount: 8000, amountPaid: 3000, balance: 5000 }],
    }
  }

  it("passes for a consistent state", () => {
    expect(() => assertFinancialReconciliation(validState())).not.toThrow()
  })

  it("passes for an all-zero empty invoice", () => {
    expect(() =>
      assertFinancialReconciliation({
        grossAmount: 0,
        totalAmount: 0,
        amountPaid: 0,
        balance: 0,
        items: [],
        installments: [],
      }),
    ).not.toThrow()
  })

  it("flags items that do not sum to gross", () => {
    expect(() => assertFinancialReconciliation({ ...validState(), items: [{ amount: 50 }] })).toThrow(
      /gross amount must equal/,
    )
  })

  it("flags installments that do not sum to the invoice total", () => {
    expect(() =>
      assertFinancialReconciliation({ ...validState(), installments: [{ amount: 9000, amountPaid: 3000, balance: 5000 }] }),
    ).toThrow(/Installment amounts must sum/)
  })

  it("flags installment paid amounts that do not sum to paid", () => {
    expect(() =>
      assertFinancialReconciliation({ ...validState(), installments: [{ amount: 8000, amountPaid: 0, balance: 5000 }] }),
    ).toThrow(/paid amounts must sum/)
  })

  it("flags installment balances that do not sum to the invoice balance", () => {
    expect(() =>
      assertFinancialReconciliation({ ...validState(), installments: [{ amount: 8000, amountPaid: 3000, balance: 6000 }] }),
    ).toThrow(/balances must sum/)
  })

  it("flags a balance that is not total minus paid", () => {
    expect(() =>
      assertFinancialReconciliation({
        ...validState(),
        balance: 4999,
        installments: [{ amount: 8000, amountPaid: 3000, balance: 4999 }],
      }),
    ).toThrow(/balance must equal total minus paid/)
  })

  it("flags a net obligation above gross", () => {
    expect(() =>
      assertFinancialReconciliation({
        grossAmount: 10000,
        totalAmount: 11000,
        amountPaid: 0,
        balance: 11000,
        items: [{ amount: 10000 }],
        installments: [{ amount: 11000, amountPaid: 0, balance: 11000 }],
      }),
    ).toThrow(/cannot exceed the gross obligation/)
  })

  it("flags a net obligation below amount paid", () => {
    expect(() =>
      assertFinancialReconciliation({
        grossAmount: 10000,
        totalAmount: 10000,
        amountPaid: 12000,
        balance: -2000,
        items: [{ amount: 10000 }],
        installments: [{ amount: 10000, amountPaid: 12000, balance: -2000 }],
      }),
    ).toThrow(/cannot be below/)
  })

  it("flags a negative amount paid", () => {
    expect(() =>
      assertFinancialReconciliation({
        grossAmount: 10000,
        totalAmount: 10000,
        amountPaid: -1,
        balance: 10001,
        items: [{ amount: 10000 }],
        installments: [{ amount: 10000, amountPaid: -1, balance: 10001 }],
      }),
    ).toThrow(/cannot be negative/)
  })
})

describe("fee-adjustment invariants (property, seeded)", () => {
  const rng = createRng(20260908)

  it("keeps net obligations reconcilable for random valid inputs", () => {
    for (let i = 0; i < 500; i += 1) {
      const gross = rng.dec(0.01, 10000, 2)
      const paid = rng.dec(0, gross, 2)
      const capacity = roundMoney(gross - paid)
      const adjustmentTotal = rng.dec(0, capacity, 2)
      const result = computeNetObligation({ grossAmount: gross, amountPaid: paid, activeAdjustmentAmounts: adjustmentTotal > 0 ? [adjustmentTotal] : [] })
      const state: FinancialState = {
        grossAmount: result.grossAmount,
        totalAmount: result.totalAmount,
        amountPaid: paid,
        balance: result.balance,
        items: [{ amount: result.grossAmount }],
        installments: [{ amount: result.totalAmount, amountPaid: paid, balance: result.balance }],
      }
      expect(() => assertFinancialReconciliation(state)).not.toThrow()
      expect(roundMoney(result.balance)).toBe(roundMoney(result.totalAmount - paid))
    }
  })

  it("restores original installment amounts and balances after reduce + reverse", () => {
    for (let i = 0; i < 500; i += 1) {
      const count = rng.int(0, 5)
      const installments: AdjustmentInstallment[] = Array.from({ length: count }, (_, index) => {
        const amount = rng.dec(0, 5000, 2)
        const amountPaid = rng.dec(0, amount, 2)
        return {
          id: `i${index}`,
          amount,
          amountPaid,
          balance: roundMoney(amount - amountPaid),
          dueDateISO: `2026-${String(rng.int(1, 12)).padStart(2, "0")}-01`,
          sortOrder: rng.int(0, 5),
        }
      })
      const outstanding = roundMoney(installments.reduce((sum, row) => sum + row.balance, 0))
      const concession = rng.dec(0.01, Math.max(0.01, outstanding + 100), 2)
      const reduction = reduceInstallments(concession, installments)
      const after = installments.map((row) => {
        const updated = reduction.updated.get(row.id)
        return updated ? { ...row, ...updated } : { ...row }
      })
      const reversal = reverseApplication(after, reduction.lines)
      const final = after.map((row) => {
        const updated = reversal.updated.get(row.id)
        return updated ? { ...row, ...updated } : { ...row }
      })
      for (let j = 0; j < installments.length; j += 1) {
        expect(final[j].amount).toBe(installments[j].amount)
        expect(final[j].balance).toBe(installments[j].balance)
        expect(final[j].amountPaid).toBe(installments[j].amountPaid)
      }
    }
  })

  it("lowers the outstanding total by exactly the applied concession", () => {
    for (let i = 0; i < 500; i += 1) {
      const count = rng.int(0, 5)
      const installments: AdjustmentInstallment[] = Array.from({ length: count }, (_, index) => {
        const amount = rng.dec(0, 5000, 2)
        const amountPaid = rng.dec(0, amount, 2)
        return {
          id: `i${index}`,
          amount,
          amountPaid,
          balance: roundMoney(amount - amountPaid),
          dueDateISO: "2026-06-01",
          sortOrder: rng.int(0, 5),
        }
      })
      const outstanding = roundMoney(installments.reduce((sum, row) => sum + row.balance, 0))
      const concession = rng.dec(0.01, Math.max(0.01, outstanding + 100), 2)
      const reduction = reduceInstallments(concession, installments)
      const after = installments.map((row) => {
        const updated = reduction.updated.get(row.id)
        return updated ? { ...row, ...updated } : { ...row }
      })
      const afterOutstanding = roundMoney(after.reduce((sum, row) => sum + row.balance, 0))
      expect(afterOutstanding).toBe(roundMoney(outstanding - reduction.applied))
      for (const row of installments) {
        const updated = reduction.updated.get(row.id)
        if (updated) expect(updated.amountPaid).toBe(row.amountPaid)
      }
    }
  })
})
