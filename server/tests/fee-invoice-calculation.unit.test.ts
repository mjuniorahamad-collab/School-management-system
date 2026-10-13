import { describe, expect, it } from "vitest"
import {
  assertInstallmentsMatchTotal,
  deriveInstallmentStatus,
  deriveInvoiceStatus,
  isInstallmentOverdue,
  parseDateISO,
  sumInstallmentInputAmounts,
  toDateISO,
  todayISODate,
} from "../src/modules/fee-invoices/fee-invoice.rules.js"

// Independent calculation-verification suite for the pure fee-invoice rules.
// Complements fees.unit.test.ts (which covers the happy paths) with boundaries,
// empty/single arrays, float-rounding and date-boundary behaviour.

describe("sumInstallmentInputAmounts (calculation)", () => {
  it("returns 0 for an empty list", () => {
    expect(sumInstallmentInputAmounts([])).toBe(0)
  })

  it("returns 0 for a single zero-amount installment", () => {
    expect(sumInstallmentInputAmounts([{ amount: 0 }])).toBe(0)
  })

  it("returns a single installment amount unchanged", () => {
    expect(sumInstallmentInputAmounts([{ amount: 12.34 }])).toBe(12.34)
  })

  it("sums decimal amounts without drift", () => {
    expect(sumInstallmentInputAmounts([{ amount: 100.1 }, { amount: 200.2 }])).toBe(300.3)
  })

  it("sums to an exact whole total from repeating thirds", () => {
    expect(
      sumInstallmentInputAmounts([{ amount: 3333.33 }, { amount: 3333.33 }, { amount: 3333.34 }]),
    ).toBe(10000)
  })

  it("rounds a classic 0.1 + 0.2 float sum", () => {
    expect(sumInstallmentInputAmounts([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3)
  })

  it("sums three single-cent amounts", () => {
    expect(
      sumInstallmentInputAmounts([{ amount: 0.01 }, { amount: 0.01 }, { amount: 0.01 }]),
    ).toBe(0.03)
  })

  it("sums 1000 single-cent installments to 10", () => {
    const many = Array.from({ length: 1000 }, () => ({ amount: 0.01 }))
    expect(sumInstallmentInputAmounts(many)).toBe(10)
  })
})

describe("assertInstallmentsMatchTotal (calculation)", () => {
  it("accepts installments that sum to the total", () => {
    expect(() => assertInstallmentsMatchTotal(300, [{ amount: 100 }, { amount: 200 }])).not.toThrow()
  })

  it("accepts a float sum equal after money rounding", () => {
    expect(() =>
      assertInstallmentsMatchTotal(300.3, [{ amount: 100.1 }, { amount: 200.2 }]),
    ).not.toThrow()
  })

  it("accepts repeating thirds that round to a whole total", () => {
    expect(() =>
      assertInstallmentsMatchTotal(10000, [
        { amount: 3333.33 },
        { amount: 3333.33 },
        { amount: 3333.34 },
      ]),
    ).not.toThrow()
  })

  it("rejects installments that do not sum to the total", () => {
    expect(() => assertInstallmentsMatchTotal(500, [{ amount: 300 }, { amount: 100 }])).toThrow(
      /must add up/,
    )
  })

  it("accepts an empty list against a zero total", () => {
    expect(() => assertInstallmentsMatchTotal(0, [])).not.toThrow()
  })

  it("rejects an empty list against a non-zero total", () => {
    expect(() => assertInstallmentsMatchTotal(0.01, [])).toThrow(/must add up/)
  })

  it("accepts exactly-summing thirds and rejects a one-cent short total", () => {
    const thirds = [{ amount: 3333.33 }, { amount: 3333.33 }, { amount: 3333.33 }]
    expect(() => assertInstallmentsMatchTotal(9999.99, thirds)).not.toThrow()
    expect(() => assertInstallmentsMatchTotal(10000, thirds)).toThrow(/must add up/)
  })

  it("accepts a single installment equal to the total", () => {
    expect(() => assertInstallmentsMatchTotal(500, [{ amount: 500 }])).not.toThrow()
  })
})

describe("isInstallmentOverdue (calculation, date boundary)", () => {
  it("flags an unpaid installment strictly past its due date", () => {
    expect(
      isInstallmentOverdue({ amountPaid: 0, balance: 100, dueDateISO: "2026-09-04" }, "2026-09-05"),
    ).toBe(true)
  })

  it("does NOT flag the installment due today (day-zero is on time)", () => {
    // Source rule (fee-invoice.rules.ts:48): balance > 0 && dueDateISO < todayISO.
    expect(
      isInstallmentOverdue({ amountPaid: 0, balance: 100, dueDateISO: "2026-09-05" }, "2026-09-05"),
    ).toBe(false)
  })

  it("does not flag a future installment", () => {
    expect(
      isInstallmentOverdue({ amountPaid: 0, balance: 100, dueDateISO: "2026-09-06" }, "2026-09-05"),
    ).toBe(false)
  })

  it("does not flag a settled installment even when past due", () => {
    expect(
      isInstallmentOverdue({ amountPaid: 100, balance: 0, dueDateISO: "2026-09-04" }, "2026-09-05"),
    ).toBe(false)
  })

  it("does not flag a non-positive balance", () => {
    expect(
      isInstallmentOverdue({ amountPaid: 105, balance: -5, dueDateISO: "2026-09-04" }, "2026-09-05"),
    ).toBe(false)
  })

  it("is independent of amountPaid (partial payment still overdue)", () => {
    expect(
      isInstallmentOverdue({ amountPaid: 40, balance: 60, dueDateISO: "2026-09-04" }, "2026-09-05"),
    ).toBe(true)
  })
})

describe("deriveInstallmentStatus (calculation)", () => {
  const TODAY = "2026-09-05"

  it("prefers PAID over overdue when the balance is zero", () => {
    expect(deriveInstallmentStatus({ amountPaid: 100, balance: 0, dueDateISO: "2026-01-01" }, TODAY)).toBe("PAID")
  })

  it("returns PAID for a settled future installment", () => {
    expect(deriveInstallmentStatus({ amountPaid: 100, balance: 0, dueDateISO: "2026-12-01" }, TODAY)).toBe("PAID")
  })

  it("returns OVERDUE for an unpaid past-due installment", () => {
    expect(deriveInstallmentStatus({ amountPaid: 0, balance: 100, dueDateISO: "2026-08-01" }, TODAY)).toBe("OVERDUE")
  })

  it("returns OVERDUE for a partially paid past-due installment", () => {
    expect(deriveInstallmentStatus({ amountPaid: 40, balance: 60, dueDateISO: "2026-08-01" }, TODAY)).toBe("OVERDUE")
  })

  it("returns PARTIAL for a partially paid installment due today", () => {
    expect(deriveInstallmentStatus({ amountPaid: 40, balance: 60, dueDateISO: TODAY }, TODAY)).toBe("PARTIAL")
  })

  it("returns UNPAID for an unpaid installment due today", () => {
    expect(deriveInstallmentStatus({ amountPaid: 0, balance: 100, dueDateISO: TODAY }, TODAY)).toBe("UNPAID")
  })

  it("returns PARTIAL for a partially paid future installment", () => {
    expect(deriveInstallmentStatus({ amountPaid: 40, balance: 60, dueDateISO: "2026-10-01" }, TODAY)).toBe("PARTIAL")
  })

  it("returns UNPAID for an unpaid future installment", () => {
    expect(deriveInstallmentStatus({ amountPaid: 0, balance: 100, dueDateISO: "2026-10-01" }, TODAY)).toBe("UNPAID")
  })
})

describe("deriveInvoiceStatus (calculation)", () => {
  const TODAY = "2026-09-05"

  it("returns UNPAID for an empty installment list", () => {
    // FIXED: an invoice with no plan has no settled obligation, so it can never
    // be PAID. A non-empty, fully-settled plan is still PAID (next test).
    expect(deriveInvoiceStatus([], TODAY)).toBe("UNPAID")
  })

  it("returns PAID when every installment is settled", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 50, balance: 0, dueDateISO: "2026-01-01" },
          { amountPaid: 50, balance: 0, dueDateISO: "2026-07-01" },
        ],
        TODAY,
      ),
    ).toBe("PAID")
  })

  it("returns OVERDUE from the earliest outstanding installment", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 50, balance: 0, dueDateISO: "2026-01-01" },
          { amountPaid: 0, balance: 50, dueDateISO: "2026-08-01" },
          { amountPaid: 0, balance: 50, dueDateISO: "2026-12-01" },
        ],
        TODAY,
      ),
    ).toBe("OVERDUE")
  })

  it("returns PARTIAL when the earliest outstanding installment is partially paid", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 50, balance: 0, dueDateISO: "2026-01-01" },
          { amountPaid: 10, balance: 40, dueDateISO: "2026-10-01" },
        ],
        TODAY,
      ),
    ).toBe("PARTIAL")
  })

  it("returns UNPAID when the earliest outstanding installment is fully unpaid and upcoming", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 50, balance: 0, dueDateISO: "2026-01-01" },
          { amountPaid: 0, balance: 50, dueDateISO: "2026-10-01" },
        ],
        TODAY,
      ),
    ).toBe("UNPAID")
  })

  it("is order-independent on equal due dates (most severe status governs)", () => {
    const unpaidThenPartial = deriveInvoiceStatus(
      [
        { amountPaid: 0, balance: 100, dueDateISO: "2026-09-05" },
        { amountPaid: 50, balance: 50, dueDateISO: "2026-09-05" },
      ],
      TODAY,
    )
    const partialThenUnpaid = deriveInvoiceStatus(
      [
        { amountPaid: 50, balance: 50, dueDateISO: "2026-09-05" },
        { amountPaid: 0, balance: 100, dueDateISO: "2026-09-05" },
      ],
      TODAY,
    )
    expect(unpaidThenPartial).toBe("PARTIAL")
    expect(partialThenUnpaid).toBe("PARTIAL")
  })

  it("reports OVERDUE for same-dated overdue installments regardless of order", () => {
    const unpaidFirst = deriveInvoiceStatus(
      [
        { amountPaid: 0, balance: 100, dueDateISO: "2026-08-01" },
        { amountPaid: 20, balance: 80, dueDateISO: "2026-08-01" },
      ],
      TODAY,
    )
    const partialFirst = deriveInvoiceStatus(
      [
        { amountPaid: 20, balance: 80, dueDateISO: "2026-08-01" },
        { amountPaid: 0, balance: 100, dueDateISO: "2026-08-01" },
      ],
      TODAY,
    )
    expect(unpaidFirst).toBe("OVERDUE")
    expect(partialFirst).toBe("OVERDUE")
  })

  it("keeps the earliest due date governing over later partially-paid rows", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 10, balance: 40, dueDateISO: "2026-11-01" },
          { amountPaid: 0, balance: 50, dueDateISO: "2026-06-01" },
        ],
        TODAY,
      ),
    ).toBe("OVERDUE")
  })

  it("derives a single outstanding installment's own status", () => {
    expect(deriveInvoiceStatus([{ amountPaid: 0, balance: 100, dueDateISO: "2026-10-01" }], TODAY)).toBe("UNPAID")
    expect(deriveInvoiceStatus([{ amountPaid: 0, balance: 100, dueDateISO: "2026-08-01" }], TODAY)).toBe("OVERDUE")
  })
})

describe("date helpers (calculation)", () => {
  it("formats a UTC midnight Date as an ISO date", () => {
    expect(toDateISO(new Date("2026-06-01T00:00:00.000Z"))).toBe("2026-06-01")
  })

  it("passes through a date string unchanged", () => {
    expect(toDateISO("2026-06-01")).toBe("2026-06-01")
  })

  it("round-trips YYYY-MM-DD through parseDateISO and toDateISO", () => {
    const iso = "2026-01-05"
    expect(toDateISO(parseDateISO(iso))).toBe(iso)
  })

  it("round-trips a leap day and normalizes a non-leap Feb 29", () => {
    expect(toDateISO(parseDateISO("2024-02-29"))).toBe("2024-02-29")
    expect(toDateISO(parseDateISO("2026-02-29"))).toBe("2026-03-01")
  })

  it("formats today from an injected UTC clock", () => {
    expect(todayISODate(new Date(Date.UTC(2026, 8, 5)))).toBe("2026-09-05")
  })
})
