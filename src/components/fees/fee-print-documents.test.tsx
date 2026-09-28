// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { InvoicePrintDocument } from "@/components/fees/InvoicePrintDocument"
import { ReceiptPrintDocument } from "@/components/receipts/ReceiptPrintDocument"
import type { FeeInvoiceDetail, ReceiptDetail } from "@/types/fees"

vi.mock("@/hooks/useBranding", () => ({
  useBranding: () => ({
    data: {
      schoolName: "Bright Future International School",
      tagline: "Excellence",
      schoolShortName: "BFIS",
      contactPhone: "+91 80 4000 1000",
      contactEmail: "office@brightfuture.example.com",
      addressLine1: "12 Lake Road",
      addressLine2: null,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
    },
  }),
}))

afterEach(() => {
  cleanup()
})

const receipt: ReceiptDetail = {
  id: "rcpt_1",
  receiptNumber: "RCT-2026-0001",
  student: { id: "stu_1", admissionNumber: "ADM-2026-0007", fullName: "Aarav Sharma" },
  className: "Grade 5",
  sectionName: "A",
  sessionName: "2025-26",
  sessionYear: 2026,
  invoiceNumber: "INV-2026-0042",
  invoiceTotal: 45000,
  amount: 15000,
  balanceAfter: 30000,
  method: "UPI",
  transactionRef: "UPI-99887",
  receiptDate: "2026-04-12T00:00:00.000Z",
  receivedByName: "R. Iyer",
  payment: { id: "pay_1", paymentNumber: "PAY-2026-0100" },
  createdAt: "2026-04-12T00:00:00.000Z",
  updatedAt: "2026-04-12T00:00:00.000Z",
}

const invoice: FeeInvoiceDetail = {
  id: "inv_1",
  invoiceNumber: "INV-2026-0042",
  student: { id: "stu_1", admissionNumber: "ADM-2026-0007", fullName: "Aarav Sharma" },
  session: { id: "ses_1", name: "2025-26", code: "AY2526" },
  className: "Grade 5",
  sectionName: "A",
  feeStructureId: null,
  totalAmount: 45000,
  amountPaid: 15000,
  balance: 30000,
  status: "PARTIAL",
  items: [
    { feeHeadId: "fh_2", feeHeadCode: "TUITION", feeHeadName: "Tuition Fee", amount: 20000, sortOrder: 2 },
    { feeHeadId: "fh_1", feeHeadCode: "ADMISSION", feeHeadName: "Admission Fee", amount: 20000, sortOrder: 1 },
  ],
  installments: [],
  notes: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
}

describe("ReceiptPrintDocument", () => {
  it("prints the amount and the balance the API returned", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)
    const text = container.textContent ?? ""

    // Values come straight off the DTO — no arithmetic in the document.
    expect(text).toContain("₹45,000")
    expect(text).toContain("₹15,000")
    expect(text).toContain("₹30,000")
  })

  it("prints the payment method as a label, including UPI", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    expect(container.textContent).toContain("Online Payment / UPI")
  })

  it("renders a letterhead from branding rather than hard-coded contact details", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    expect(container.textContent).toContain("Bright Future International School")
  })

  it("is a print-only region that is absent from the screen", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)
    const document = container.querySelector(".print-document")

    expect(document).not.toBeNull()
    expect(document?.className).toContain("hidden")
    expect(document?.className).toContain("print:block")
  })

  it("carries the immutability statement the screen shows", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    expect(container.textContent).toContain("immutable record")
  })
})

describe("InvoicePrintDocument", () => {
  it("labels the amount owed as Total payable", () => {
    // Decision D3: the document states what is owed, not how it was derived.
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)
    const text = container.textContent ?? ""

    expect(text).toContain("Total payable")
    expect(text).toContain("₹30,000")
  })

  it("prints only the canonical net values, with no gross or concession line", () => {
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)
    const text = (container.textContent ?? "").toLowerCase()

    expect(text).not.toContain("gross")
    expect(text).not.toContain("concession")
    expect(text).not.toContain("discount")
  })

  it("orders fee heads by their snapshot sort order", () => {
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)
    const codes = Array.from(container.querySelectorAll("tbody tr td:first-child")).map(
      (cell) => cell.textContent ?? "",
    )

    expect(codes).toEqual(["ADMISSION", "TUITION"])
  })

  it("never re-derives the total from the printed fee heads", () => {
    // This fixture's fee heads deliberately do not sum to `totalAmount` (it models
    // a server-side adjustment). A document that added the printed rows up would
    // print ₹40,000; the canonical DTO value must win.
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)
    const text = container.textContent ?? ""

    expect(invoice.items.reduce((sum, item) => sum + item.amount, 0)).not.toBe(invoice.totalAmount)
    expect(text).toContain("₹45,000")
    expect(text).not.toContain("₹40,000")
  })
})

describe("financial document structure", () => {
  it("gives the receipt the single-page document frame", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    expect(container.querySelector(".print-document-frame")).not.toBeNull()
  })

  it("gives the invoice the single-page document frame", () => {
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)

    expect(container.querySelector(".print-document-frame")).not.toBeNull()
  })

  it("prints the amount received in words, matching the printed figure", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    // ₹15,000 — the words must state the same figure the strip shows.
    expect(container.textContent).toContain("Fifteen Thousand Rupees only")
  })

  it("pre-fills the Received by signature from the server name, exactly once", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)
    const occurrences = (container.textContent ?? "").split("R. Iyer").length - 1

    expect(occurrences).toBe(1)
    expect(container.textContent).toContain("Received by")
  })

  it("prints the session year the DTO carries", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    expect(container.textContent).toContain("2025-26 2026")
  })

  it("states plainly that the receipt does not itemise fee heads", () => {
    // ReceiptDetail carries no line items, so the document must not imply it does —
    // it points the reader at the invoice, which does carry the breakdown.
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    expect(container.textContent).toContain("does not itemise")
    expect(container.textContent).toContain("INV-2026-0042")
  })

  it("invents no cheque, bank or gateway particulars the DTO does not carry", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)
    const text = (container.textContent ?? "").toLowerCase()

    // ReceiptDetail has only `method` and `transactionRef`; these must not appear.
    for (const fabricated of ["cheque number", "cheque no", "bank ref", "utr", "gpay", "phonepe", "paytm"]) {
      expect(text, `must not fabricate "${fabricated}"`).not.toContain(fabricated)
    }
  })

  it("prints the transaction reference the API returned", () => {
    const { container } = render(<ReceiptPrintDocument receipt={receipt} />)

    expect(container.textContent).toContain("UPI-99887")
  })

  it("prints a placeholder rather than a blank when no transaction reference exists", () => {
    const { container } = render(
      <ReceiptPrintDocument receipt={{ ...receipt, transactionRef: null }} />,
    )

    expect(container.textContent).toContain("Not provided")
  })

  it("invents no fee period on the invoice, which carries none", () => {
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)
    const text = (container.textContent ?? "").toLowerCase()

    expect(text).not.toContain("fee period")
  })

  it("prints the invoice's own notes when the server supplied one", () => {
    const { container } = render(
      <InvoicePrintDocument invoice={{ ...invoice, notes: "Sibling discount applied at admission." }} />,
    )

    expect(container.textContent).toContain("Sibling discount applied at admission.")
  })

  it("falls back to a neutral net-amount statement when the invoice has no notes", () => {
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)

    expect(container.textContent).toContain("net amounts recorded on this invoice")
  })

  it("orders the payment schedule by installment number", () => {
    const withSchedule: FeeInvoiceDetail = {
      ...invoice,
      installments: [
        { id: "in_3", installmentNo: 3, label: "Term 3", amount: 15000, amountPaid: 0, balance: 15000, dueDate: "2026-09-01T00:00:00.000Z", status: "UNPAID" },
        { id: "in_1", installmentNo: 1, label: "Term 1", amount: 15000, amountPaid: 15000, balance: 0, dueDate: "2026-04-01T00:00:00.000Z", status: "PAID" },
        { id: "in_2", installmentNo: 2, label: "Term 2", amount: 15000, amountPaid: 0, balance: 15000, dueDate: "2026-07-01T00:00:00.000Z", status: "UNPAID" },
      ],
    }
    const { container } = render(<InvoicePrintDocument invoice={withSchedule} />)
    const schedule = container.querySelectorAll("table")[1]
    const firstCells = Array.from(schedule?.querySelectorAll("tbody tr td:first-child") ?? []).map(
      (cell) => cell.textContent ?? "",
    )

    expect(firstCells).toEqual(["1", "2", "3"])
  })

  it("omits the payment schedule entirely when the invoice has no installments", () => {
    const { container } = render(<InvoicePrintDocument invoice={invoice} />)
    const text = container.textContent ?? ""

    expect(text).not.toContain("Payment schedule")
  })

  it("renders the repeating footer on both financial documents", () => {
    const receiptRender = render(<ReceiptPrintDocument receipt={receipt} />)
    expect(receiptRender.container.querySelector(".print-document-footer")?.textContent).toContain("Fee Receipt")
    cleanup()

    const invoiceRender = render(<InvoicePrintDocument invoice={invoice} />)
    expect(invoiceRender.container.querySelector(".print-document-footer")?.textContent).toContain("Fee Invoice")
  })
})
