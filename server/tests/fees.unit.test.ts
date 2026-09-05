import { describe, expect, it } from "vitest"
import {
  assertItemsNonEmpty,
  assertUniqueFeeHeadIds,
  sumItemAmounts,
} from "../src/modules/fee-structures/fee-structure.rules.js"
import {
  assertInstallmentsMatchTotal,
  deriveInstallmentStatus,
  deriveInvoiceStatus,
  parseDateISO,
  toDateISO,
  todayISODate,
} from "../src/modules/fee-invoices/fee-invoice.rules.js"
import {
  createFeeStructureSchema,
  listFeeStructuresQuerySchema,
} from "../src/modules/fee-structures/fee-structure.schema.js"
import {
  generateInvoicesSchema,
  generationPreviewSchema,
  listInvoicesQuerySchema,
} from "../src/modules/fee-invoices/fee-invoice.schema.js"
import {
  applyAllocation,
  allocatePayment,
  isOverpayment,
  totalOutstandingBalance,
} from "../src/modules/payments/payment.rules.js"
import { createPaymentSchema, listPaymentsQuerySchema } from "../src/modules/payments/payment.schema.js"
import { listReceiptsQuerySchema } from "../src/modules/receipts/receipt.schema.js"
import { buildPaymentNumber, buildReceiptNumber } from "../src/lib/id-generators.js"

describe("fee-structure rules (database-free)", () => {
  it("rounds item sums to two decimal places", () => {
    expect(sumItemAmounts([{ amount: 100.1 }, { amount: 200.2 }])).toBe(300.3)
    expect(sumItemAmounts([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3)
    expect(sumItemAmounts([{ amount: 12.34 }])).toBe(12.34)
  })

  it("rejects duplicate fee heads in a structure", () => {
    expect(() => assertUniqueFeeHeadIds(["a", "b", "a"])).toThrow(/only appear once/)
    expect(() => assertUniqueFeeHeadIds(["a", "b"])).not.toThrow()
  })

  it("rejects empty structures", () => {
    expect(() => assertItemsNonEmpty(0)).toThrow(/at least one item/)
    expect(() => assertItemsNonEmpty(1)).not.toThrow()
  })
})

describe("installment/invoice status derivation (database-free)", () => {
  const T = "2026-09-05"

  it("marks a settled installment as PAID", () => {
    expect(deriveInstallmentStatus({ amountPaid: 100, balance: 0, dueDateISO: "2026-01-01" }, T)).toBe("PAID")
  })

  it("marks an unpaid installment past its due date as OVERDUE", () => {
    expect(deriveInstallmentStatus({ amountPaid: 0, balance: 100, dueDateISO: "2026-08-01" }, T)).toBe("OVERDUE")
    expect(deriveInstallmentStatus({ amountPaid: 40, balance: 60, dueDateISO: "2026-08-01" }, T)).toBe("OVERDUE")
  })

  it("marks a partially paid installment before its due date as PARTIAL", () => {
    expect(deriveInstallmentStatus({ amountPaid: 40, balance: 60, dueDateISO: "2026-10-01" }, T)).toBe("PARTIAL")
  })

  it("marks a fully unpaid installment before its due date as UNPAID", () => {
    expect(deriveInstallmentStatus({ amountPaid: 0, balance: 100, dueDateISO: "2026-10-01" }, T)).toBe("UNPAID")
  })

  it("derives invoice PAID when every installment is settled", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 50, balance: 0, dueDateISO: "2026-01-01" },
          { amountPaid: 50, balance: 0, dueDateISO: "2026-07-01" },
        ],
        T,
      ),
    ).toBe("PAID")
  })

  it("derives invoice OVERDUE from the earliest outstanding installment", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 50, balance: 0, dueDateISO: "2026-01-01" },
          { amountPaid: 0, balance: 50, dueDateISO: "2026-08-01" },
        ],
        T,
      ),
    ).toBe("OVERDUE")
  })

  it("derives invoice PARTIAL when an upcoming installment is outstanding and the earlier ones are paid", () => {
    expect(
      deriveInvoiceStatus(
        [
          { amountPaid: 50, balance: 0, dueDateISO: "2026-01-01" },
          { amountPaid: 10, balance: 40, dueDateISO: "2026-10-01" },
        ],
        T,
      ),
    ).toBe("PARTIAL")
  })

  it("derives invoice UNPAID when the earliest installment is upcoming and unpaid", () => {
    expect(
      deriveInvoiceStatus([{ amountPaid: 0, balance: 100, dueDateISO: "2026-10-01" }], T),
    ).toBe("UNPAID")
  })
})

describe("installment totals (database-free)", () => {
  it("accepts installments that sum to the structure total", () => {
    expect(() => assertInstallmentsMatchTotal(500, [{ amount: 300 }, { amount: 200 }])).not.toThrow()
  })

  it("accepts floating-point sums after money rounding", () => {
    expect(() => assertInstallmentsMatchTotal(300.3, [{ amount: 100.1 }, { amount: 200.2 }])).not.toThrow()
  })

  it("rejects installments that do not sum to the total", () => {
    expect(() => assertInstallmentsMatchTotal(500, [{ amount: 300 }, { amount: 100 }])).toThrow(/must add up/)
  })
})

describe("date helpers (database-free)", () => {
  it("round-trips an ISO date through parseDateISO and toDateISO", () => {
    const iso = "2026-06-01"
    expect(toDateISO(new Date("2026-06-01T00:00:00.000Z"))).toBe(iso)
    expect(toDateISO(parseDateISO(iso))).toBe(iso)
  })

  it("normalizes midnight-UTC Date values without day drift", () => {
    expect(toDateISO(new Date("2026-06-01T00:00:00.000Z"))).toBe("2026-06-01")
  })

  it("formats today from an injected clock", () => {
    expect(todayISODate(new Date("2026-09-05T00:00:00.000Z"))).toBe("2026-09-05")
  })
})

describe("fee-structure schemas (database-free)", () => {
  const valid = {
    name: "Grade 7 Fee Structure — 2026",
    sessionId: "sess-1",
    classId: "class-1",
    items: [{ feeHeadId: "head-1", amount: 250000 }, { feeHeadId: "head-2", amount: 75000 }],
  }

  it("accepts a complete valid structure", () => {
    expect(createFeeStructureSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects duplicate fee heads at validation time", () => {
    const result = createFeeStructureSchema.safeParse({
      ...valid,
      items: [{ feeHeadId: "head-1", amount: 100 }, { feeHeadId: "head-1", amount: 200 }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects structures with no items", () => {
    const result = createFeeStructureSchema.safeParse({ ...valid, items: [] })
    expect(result.success).toBe(false)
  })

  it("rejects amounts with more than two decimal places", () => {
    const result = createFeeStructureSchema.safeParse({
      ...valid,
      items: [{ feeHeadId: "head-1", amount: 100.999 }],
    })
    expect(result.success).toBe(false)
  })

  it("list query coerces pagination defaults", () => {
    const parsed = listFeeStructuresQuerySchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.page).toBe(1)
      expect(parsed.data.pageSize).toBe(20)
      expect(parsed.data.sortBy).toBe("name")
    }
  })
})

describe("fee-invoice schemas (database-free)", () => {
  it("accepts a generation request without installments (defaults to one)", () => {
    const result = generateInvoicesSchema.safeParse({ sessionId: "sess-1", classId: "class-1" })
    expect(result.success).toBe(true)
  })

  it("accepts custom installments with YYYY-MM-DD due dates", () => {
    const result = generateInvoicesSchema.safeParse({
      sessionId: "sess-1",
      classId: "class-1",
      installments: [
        { label: "Term 1", amount: 250, dueDate: "2026-04-01" },
        { label: "Term 2", amount: 250, dueDate: "2026-09-01" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects malformed due dates", () => {
    const result = generateInvoicesSchema.safeParse({
      sessionId: "sess-1",
      classId: "class-1",
      installments: [{ label: "Term 1", amount: 250, dueDate: "01/04/2026" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a generation request without a class", () => {
    const result = generateInvoicesSchema.safeParse({ sessionId: "sess-1" })
    expect(result.success).toBe(false)
  })

  it("rejects a generation preview without a session", () => {
    const result = generationPreviewSchema.safeParse({ classId: "class-1" })
    expect(result.success).toBe(false)
  })

  it("list invoices query coerces defaults", () => {
    const parsed = listInvoicesQuerySchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.page).toBe(1)
      expect(parsed.data.sortBy).toBe("createdAt")
      expect(parsed.data.sortDir).toBe("desc")
    }
  })

  it("rejects unknown invoice statuses", () => {
    const result = listInvoicesQuerySchema.safeParse({ status: "REFUNDED" })
    expect(result.success).toBe(false)
  })
})

describe("payment number helpers (database-free)", () => {
  it("formats payment and receipt numbers with a zero-padded sequence", () => {
    expect(buildPaymentNumber(2026, 1)).toBe("PAY-2026-0001")
    expect(buildReceiptNumber(2026, 42)).toBe("RCT-2026-0042")
  })

  it("rejects invalid payment sequences", () => {
    expect(() => buildPaymentNumber(2026, 0)).toThrow(/sequence/)
    expect(() => buildPaymentNumber(2026, 1.5)).toThrow(/sequence/)
  })
})

describe("payment allocation rules (database-free)", () => {
  const installments = [
    { id: "a", installmentNo: 1, amountPaid: 0, balance: 100, dueDateISO: "2026-04-01", sortOrder: 1 },
    { id: "b", installmentNo: 2, amountPaid: 0, balance: 100, dueDateISO: "2026-09-01", sortOrder: 2 },
    { id: "c", installmentNo: 3, amountPaid: 0, balance: 100, dueDateISO: "2026-04-01", sortOrder: 3 },
  ]

  it("sums outstanding balances with money rounding", () => {
    expect(totalOutstandingBalance([{ balance: 100.1 }, { balance: 200.2 }])).toBe(300.3)
    expect(totalOutstandingBalance(installments)).toBe(300)
  })

  it("detects overpayments", () => {
    expect(isOverpayment(300, installments)).toBe(false)
    expect(isOverpayment(300.01, installments)).toBe(true)
  })

  it("applies FIFO by due date with sort-order tie-breaking", () => {
    const lines = allocatePayment(150, installments)
    expect(lines).toEqual([
      { installmentId: "a", amountApplied: 100 },
      { installmentId: "c", amountApplied: 50 },
    ])
  })

  it("ignores installments already settled", () => {
    const settled = installments.map((installment, index) =>
      index === 0 ? { ...installment, amountPaid: 100, balance: 0 } : installment,
    )
    const lines = allocatePayment(150, settled)
    expect(lines).toEqual([
      { installmentId: "c", amountApplied: 100 },
      { installmentId: "b", amountApplied: 50 },
    ])
  })

  it("applies the exact outstanding balance without rounding drift", () => {
    const lines = allocatePayment(0.3, [
      { id: "x", installmentNo: 1, amountPaid: 0, balance: 0.1, dueDateISO: "2026-01-01", sortOrder: 1 },
      { id: "y", installmentNo: 2, amountPaid: 0, balance: 0.2, dueDateISO: "2026-02-01", sortOrder: 2 },
    ])
    expect(lines).toEqual([
      { installmentId: "x", amountApplied: 0.1 },
      { installmentId: "y", amountApplied: 0.2 },
    ])
  })

  it("computes post-payment ledger state only for affected installments", () => {
    const allocation = allocatePayment(50, installments)
    const updated = applyAllocation(installments, allocation)
    expect(updated.get("a")).toEqual({ amountPaid: 50, balance: 50 })
    expect(updated.has("b")).toBe(false)
  })
})

describe("payment schemas (database-free)", () => {
  const valid = {
    invoiceId: "inv-1",
    amount: 250,
    method: "CASH",
    paymentDate: "2026-09-05",
    idempotencyKey: "payment-inv-1-attempt-1",
  }

  it("accepts a complete valid payment", () => {
    expect(createPaymentSchema.safeParse(valid).success).toBe(true)
  })

  it("accepts optional transactionRef and notes", () => {
    const result = createPaymentSchema.safeParse({
      ...valid,
      transactionRef: "TXN-123",
      notes: "Term 1 fees",
    })
    expect(result.success).toBe(true)
  })

  it("treats empty-string optionals as absent", () => {
    const result = createPaymentSchema.safeParse({ ...valid, transactionRef: "", notes: "" })
    expect(result.success).toBe(true)
  })

  it("rejects malformed payment dates", () => {
    const result = createPaymentSchema.safeParse({ ...valid, paymentDate: "05/09/2026" })
    expect(result.success).toBe(false)
  })

  it("rejects unknown payment methods", () => {
    const result = createPaymentSchema.safeParse({ ...valid, method: "CRYPTO" })
    expect(result.success).toBe(false)
  })

  it("rejects zero and negative amounts", () => {
    expect(createPaymentSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false)
    expect(createPaymentSchema.safeParse({ ...valid, amount: -10 }).success).toBe(false)
  })

  it("rejects short or missing idempotency keys", () => {
    expect(createPaymentSchema.safeParse({ ...valid, idempotencyKey: "short" }).success).toBe(false)
    const withoutKey = {
      invoiceId: valid.invoiceId,
      amount: valid.amount,
      method: valid.method,
      paymentDate: valid.paymentDate,
    }
    expect(createPaymentSchema.safeParse(withoutKey).success).toBe(false)
  })

  it("rejects unknown top-level fields", () => {
    const result = createPaymentSchema.safeParse({ ...valid, extra: true })
    expect(result.success).toBe(false)
  })

  it("list payments query coerces defaults and filters", () => {
    const parsed = listPaymentsQuerySchema.safeParse({ method: "CASH", from: "2026-01-01" })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.page).toBe(1)
      expect(parsed.data.pageSize).toBe(20)
      expect(parsed.data.sortBy).toBe("createdAt")
      expect(parsed.data.method).toBe("CASH")
    }
    expect(listPaymentsQuerySchema.safeParse({ method: "BOGUS" }).success).toBe(false)
  })
})

describe("receipt schemas (database-free)", () => {
  it("list receipts query coerces defaults", () => {
    const parsed = listReceiptsQuerySchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.page).toBe(1)
      expect(parsed.data.sortBy).toBe("createdAt")
      expect(parsed.data.sortDir).toBe("desc")
    }
  })

  it("rejects unknown sort fields", () => {
    const result = listReceiptsQuerySchema.safeParse({ sortBy: "expiry" })
    expect(result.success).toBe(false)
  })
})