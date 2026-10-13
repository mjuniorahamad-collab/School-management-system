import { describe, expect, it } from "vitest"
import {
  applyAllocation,
  allocatePayment,
  isOverpayment,
  totalOutstandingBalance,
} from "../src/modules/payments/payment.rules.js"
import type { AllocatableInstallment } from "../src/modules/payments/payment.rules.js"
import { roundMoney } from "../src/lib/money.js"
import { createRng } from "./helpers/seeded-random.js"

// Independent calculation-verification suite for the pure payment rules.
// Complements fees.unit.test.ts with over/under/exact payment cases, empty and
// single-item arrays, and property invariants over generated ledgers.

function installment(
  id: string,
  balance: number,
  dueDateISO: string,
  sortOrder: number,
  amountPaid = 0,
): AllocatableInstallment {
  return { id, amountPaid, balance, dueDateISO, sortOrder }
}

describe("totalOutstandingBalance (calculation)", () => {
  it("returns 0 for an empty list", () => {
    expect(totalOutstandingBalance([])).toBe(0)
  })

  it("returns 0 when every balance is zero", () => {
    expect(totalOutstandingBalance([{ balance: 0 }, { balance: 0 }])).toBe(0)
  })

  it("returns a single balance unchanged", () => {
    expect(totalOutstandingBalance([{ balance: 250 }])).toBe(250)
  })

  it("sums decimal balances without drift", () => {
    expect(totalOutstandingBalance([{ balance: 100.1 }, { balance: 200.2 }])).toBe(300.3)
  })

  it("rounds a classic 0.1 + 0.2 float sum", () => {
    expect(totalOutstandingBalance([{ balance: 0.1 }, { balance: 0.2 }])).toBe(0.3)
  })

  it("rejects a negative balance instead of cancelling it", () => {
    // FIXED: a negative balance would silently weaken the overpayment guard, so
    // it is rejected rather than netted against a positive one. Balances are
    // non-negative by construction upstream (amount − paid).
    expect(() => totalOutstandingBalance([{ balance: 100 }, { balance: -100 }])).toThrow(RangeError)
    expect(() => totalOutstandingBalance([{ balance: -0.01 }])).toThrow(/non-negative/)
  })

  it("rejects a non-finite balance", () => {
    expect(() => totalOutstandingBalance([{ balance: Number.NaN }])).toThrow(/finite/)
    expect(() => totalOutstandingBalance([{ balance: Number.POSITIVE_INFINITY }])).toThrow(/finite/)
  })
})

describe("isOverpayment (calculation)", () => {
  const rows = [installment("a", 100, "2026-04-01", 1), installment("b", 100, "2026-09-01", 2), installment("c", 100, "2026-04-01", 3)]

  it("returns false for an exact payment", () => {
    expect(isOverpayment(300, rows)).toBe(false)
  })

  it("returns false for an underpayment", () => {
    expect(isOverpayment(299.99, rows)).toBe(false)
  })

  it("returns true for one cent over", () => {
    expect(isOverpayment(300.01, rows)).toBe(true)
  })

  it("handles a float boundary without drift", () => {
    const floats = [{ balance: 0.1 }, { balance: 0.2 }]
    expect(isOverpayment(0.3, floats)).toBe(false)
    expect(isOverpayment(0.31, floats)).toBe(true)
  })

  it("treats a non-positive payment on an empty ledger as not an overpayment", () => {
    expect(isOverpayment(0, [])).toBe(false)
  })

  it("treats any positive payment on an empty ledger as an overpayment", () => {
    expect(isOverpayment(0.01, [])).toBe(true)
  })
})

describe("allocatePayment (calculation)", () => {
  const rows = [
    installment("a", 100, "2026-04-01", 1),
    installment("b", 100, "2026-09-01", 2),
    installment("c", 100, "2026-04-01", 3),
  ]

  it("returns no lines for a zero payment", () => {
    expect(allocatePayment(0, rows)).toEqual([])
  })

  it("returns no lines for an empty ledger", () => {
    expect(allocatePayment(100, [])).toEqual([])
  })

  it("returns no lines when every installment is already settled", () => {
    const settled = rows.map((row) => ({ ...row, amountPaid: row.balance, balance: 0 }))
    expect(allocatePayment(100, settled)).toEqual([])
  })

  it("applies a partial payment to a single installment", () => {
    expect(allocatePayment(40, [installment("x", 100, "2026-04-01", 1)])).toEqual([
      { installmentId: "x", amountApplied: 40 },
    ])
  })

  it("settles a single installment exactly", () => {
    expect(allocatePayment(100, [installment("x", 100, "2026-04-01", 1)])).toEqual([
      { installmentId: "x", amountApplied: 100 },
    ])
  })

  it("applies FIFO by due date with sort-order tie-breaking", () => {
    expect(allocatePayment(150, rows)).toEqual([
      { installmentId: "a", amountApplied: 100 },
      { installmentId: "c", amountApplied: 50 },
    ])
  })

  it("orders equal due dates by ascending sort order", () => {
    const shuffled = [installment("c", 100, "2026-04-01", 3), installment("a", 100, "2026-04-01", 1)]
    expect(allocatePayment(100, shuffled)).toEqual([{ installmentId: "a", amountApplied: 100 }])
  })

  it("leaves the remainder unallocated on an underpayment", () => {
    const lines = allocatePayment(50, rows)
    expect(lines).toEqual([{ installmentId: "a", amountApplied: 50 }])
    expect(roundMoney(lines.reduce((sum, line) => sum + line.amountApplied, 0))).toBe(50)
  })

  it("allocates every balance on an exact payment", () => {
    const lines = allocatePayment(300, rows)
    expect(lines).toEqual([
      { installmentId: "a", amountApplied: 100 },
      { installmentId: "c", amountApplied: 100 },
      { installmentId: "b", amountApplied: 100 },
    ])
  })

  it("caps allocation at the outstanding balance on an overpayment", () => {
    const lines = allocatePayment(350, rows)
    expect(lines).toEqual([
      { installmentId: "a", amountApplied: 100 },
      { installmentId: "c", amountApplied: 100 },
      { installmentId: "b", amountApplied: 100 },
    ])
    expect(roundMoney(lines.reduce((sum, line) => sum + line.amountApplied, 0))).toBe(300)
  })

  it("splits a float payment across float balances without drift", () => {
    const lines = allocatePayment(0.3, [
      installment("x", 0.1, "2026-01-01", 1),
      installment("y", 0.2, "2026-02-01", 2),
    ])
    expect(lines).toEqual([
      { installmentId: "x", amountApplied: 0.1 },
      { installmentId: "y", amountApplied: 0.2 },
    ])
  })

  it("does not mutate the input ledger", () => {
    const input = [installment("a", 100, "2026-04-01", 1)]
    const snapshot = { ...input[0] }
    allocatePayment(40, input)
    expect(input[0]).toEqual(snapshot)
  })
})

describe("applyAllocation (calculation)", () => {
  const rows = [
    installment("a", 100, "2026-04-01", 1, 0),
    installment("b", 100, "2026-09-01", 2, 0),
    installment("c", 100, "2026-04-01", 3, 25),
  ]

  it("updates only the affected installments", () => {
    const updated = applyAllocation(rows, allocatePayment(50, rows))
    expect(updated.get("a")).toEqual({ amountPaid: 50, balance: 50 })
    expect(updated.has("b")).toBe(false)
    expect(updated.has("c")).toBe(false)
  })

  it("ignores an allocation line for an unknown installment id", () => {
    const updated = applyAllocation(rows, [{ installmentId: "zzz", amountApplied: 10 }])
    expect(updated.size).toBe(0)
  })

  it("returns an empty map for an empty allocation", () => {
    expect(applyAllocation(rows, []).size).toBe(0)
  })

  it("settles an installment to a zero balance", () => {
    const updated = applyAllocation(rows, [{ installmentId: "a", amountApplied: 100 }])
    expect(updated.get("a")).toEqual({ amountPaid: 100, balance: 0 })
  })

  it("updates independent ids independently", () => {
    const updated = applyAllocation(rows, [
      { installmentId: "a", amountApplied: 10 },
      { installmentId: "b", amountApplied: 20 },
    ])
    expect(updated.get("a")).toEqual({ amountPaid: 10, balance: 90 })
    expect(updated.get("b")).toEqual({ amountPaid: 20, balance: 80 })
  })

  it("carries the existing amountPaid forward", () => {
    const updated = applyAllocation(rows, [{ installmentId: "c", amountApplied: 75 }])
    expect(updated.get("c")).toEqual({ amountPaid: 100, balance: 25 })
  })

  it("rejects duplicate lines for the same id instead of silently dropping one", () => {
    // FIXED: a duplicate installmentId would otherwise be applied against the
    // ORIGINAL row and lose the earlier line. allocatePayment never produces
    // duplicates, so this is defense-in-depth.
    expect(() =>
      applyAllocation(rows, [
        { installmentId: "a", amountApplied: 10 },
        { installmentId: "a", amountApplied: 20 },
      ]),
    ).toThrow(/duplicate allocation/)
  })
})

describe("payment allocation invariants (property, seeded)", () => {
  const rng = createRng(20260905)

  function randomLedger(): AllocatableInstallment[] {
    const count = rng.int(0, 6)
    return Array.from({ length: count }, (_, index) =>
      installment(
        `i${index}`,
        rng.dec(0, 500, 2),
        `2026-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
        rng.int(0, 5),
        rng.dec(0, 100, 2),
      ),
    )
  }

  it("never allocates more than the payment amount", () => {
    for (let i = 0; i < 1000; i += 1) {
      const ledger = randomLedger()
      const amount = rng.dec(0, 2000, 2)
      const allocated = roundMoney(allocatePayment(amount, ledger).reduce((sum, line) => sum + line.amountApplied, 0))
      expect(allocated).toBeLessThanOrEqual(roundMoney(amount))
    }
  })

  it("never allocates more than the outstanding balance", () => {
    for (let i = 0; i < 1000; i += 1) {
      const ledger = randomLedger()
      const amount = rng.dec(0, 2000, 2)
      const allocated = roundMoney(allocatePayment(amount, ledger).reduce((sum, line) => sum + line.amountApplied, 0))
      expect(allocated).toBeLessThanOrEqual(totalOutstandingBalance(ledger))
    }
  })

  it("allocates exactly min(payment, outstanding)", () => {
    for (let i = 0; i < 1000; i += 1) {
      const ledger = randomLedger()
      const amount = rng.dec(0, 2000, 2)
      const allocated = roundMoney(allocatePayment(amount, ledger).reduce((sum, line) => sum + line.amountApplied, 0))
      expect(allocated).toBe(roundMoney(Math.min(amount, totalOutstandingBalance(ledger))))
    }
  })

  it("leaves post-allocation balances summing to outstanding minus allocated", () => {
    for (let i = 0; i < 500; i += 1) {
      const ledger = randomLedger()
      const amount = rng.dec(0, 2000, 2)
      const allocation = allocatePayment(amount, ledger)
      const allocated = roundMoney(allocation.reduce((sum, line) => sum + line.amountApplied, 0))
      const updated = applyAllocation(ledger, allocation)
      const balances = ledger.map((row) => updated.get(row.id)?.balance ?? row.balance)
      const total = roundMoney(balances.reduce((sum, balance) => sum + balance, 0))
      expect(total).toBe(roundMoney(totalOutstandingBalance(ledger) - allocated))
    }
  })

  it("applies no more than each installment's balance and preserves paid+balance", () => {
    for (let i = 0; i < 500; i += 1) {
      const ledger = randomLedger()
      const allocation = allocatePayment(rng.dec(0, 2000, 2), ledger)
      const updated = applyAllocation(ledger, allocation)
      for (const row of ledger) {
        const next = updated.get(row.id)
        if (!next) continue
        expect(next.balance).toBeGreaterThanOrEqual(0)
        expect(next.balance).toBeLessThanOrEqual(row.balance)
        expect(roundMoney(next.amountPaid + next.balance)).toBe(roundMoney(row.amountPaid + row.balance))
      }
    }
  })
})
