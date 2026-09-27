// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PaymentFormDialog } from "@/components/payments/PaymentFormDialog"
import type { FeeInvoiceListItem } from "@/types/fees"

// DOM tests for the payment form's two modes.
//
// The dialog now has two shapes. In contextual mode the caller passes the
// invoice it already loaded and the global picker is replaced by a read-only
// summary; in global mode the picker behaves as it always did. Both modes share
// the same form body, so these tests focus on the selector slot and on the
// eligibility filter, and deliberately do not re-test amount/method/date
// validation, which the server enforces independently.
//
// `useFeeInvoices` is the seam. Asserting the `enabled` flag it receives is
// what proves the contextual mode does not fire a 100-row global read, which
// hiding the markup alone would not.

const { useFeeInvoices, useCreatePayment } = vi.hoisted(() => ({
  useFeeInvoices: vi.fn(),
  useCreatePayment: vi.fn(),
}))

vi.mock("@/hooks/useFeeInvoices", () => ({ useFeeInvoices }))
vi.mock("@/hooks/usePayments", () => ({ useCreatePayment }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Radix Select drives a scrollable listbox and measures the viewport. jsdom
// provides neither, so the Select cannot open without these three shims.
beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

function invoice(overrides: Partial<FeeInvoiceListItem> = {}): FeeInvoiceListItem {
  return {
    id: "inv-1",
    invoiceNumber: "INV-2026-1001",
    student: { id: "stu-1", admissionNumber: "STU-2026-0001", fullName: "Amina Adamu" },
    className: "Six",
    sectionName: "A",
    sessionName: "Fees Year",
    totalAmount: 1000,
    amountPaid: 400,
    balance: 600,
    status: "PARTIAL",
    nextDueDate: "2027-01-15T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  }
}

function mockInvoices(items: FeeInvoiceListItem[]) {
  useFeeInvoices.mockReturnValue({ data: { items }, isPending: false, isError: false })
}

function invoicesEnabled(): unknown {
  expect(useFeeInvoices).toHaveBeenCalled()
  return useFeeInvoices.mock.calls[0][1]?.enabled
}

const invoicePicker = () => screen.queryByRole("combobox", { name: /invoice/i })

// Radix opens its listbox from a pointerdown that looks like a real primary
// click; a bare fireEvent.pointerDown leaves it closed, so the payload matters.
function openInvoicePicker() {
  fireEvent.pointerDown(invoicePicker() as HTMLElement, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  })
  return screen.queryAllByRole("option").map((option) => option.textContent ?? "")
}

beforeEach(() => {
  useFeeInvoices.mockReset()
  useCreatePayment.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockInvoices([])
})

afterEach(() => {
  cleanup()
})

describe("PaymentFormDialog contextual mode", () => {
  it("replaces the global invoice picker with a fixed summary", () => {
    mockInvoices([])
    render(
      <PaymentFormDialog
        open
        onOpenChange={vi.fn()}
        selectedInvoice={invoice()}
      />,
    )

    // No picker exists at all, so there is no control that could retarget the
    // payment to a different student.
    expect(invoicePicker()).toBeNull()
    expect(screen.getByText("INV-2026-1001")).toBeDefined()
    expect(screen.getByText("Amina Adamu")).toBeDefined()
    expect(screen.getByText(/STU-2026-0001/)).toBeDefined()
  })

  it("does not fetch the global invoice list", () => {
    mockInvoices([])
    render(
      <PaymentFormDialog open onOpenChange={vi.fn()} selectedInvoice={invoice()} />,
    )
    expect(invoicesEnabled()).toBe(false)
  })

  // Contextual mode has no control to name. Rendering the Label anyway would
  // leave htmlFor pointing at an id that no longer exists.
  it("renders no dangling invoice label when there is no picker", () => {
    mockInvoices([])
    render(
      <PaymentFormDialog open onOpenChange={vi.fn()} selectedInvoice={invoice()} />,
    )

    expect(invoicePicker()).toBeNull()
    expect(document.getElementById("payment-invoice")).toBeNull()
    expect(screen.queryByText("Invoice")).toBeNull()
    // The summary itself is still the invoice context for this mode.
    expect(screen.getByText("INV-2026-1001")).toBeDefined()
  })

  // The student profile card resolves the invoice directly, so the target may
  // sit outside the global first page. The dialog must read the prop, not the
  // fetched list, or the balance hint would silently vanish.
  it("reads the balance from the prop even when the global list lacks it", () => {
    mockInvoices([invoice({ id: "other", invoiceNumber: "INV-2026-9999", balance: 10 })])
    render(
      <PaymentFormDialog open onOpenChange={vi.fn()} selectedInvoice={invoice()} />,
    )
    expect(screen.getByText(/Outstanding balance is ₹600/)).toBeDefined()
  })

  it("shows the money summary and the invoice status", () => {
    mockInvoices([])
    render(
      <PaymentFormDialog open onOpenChange={vi.fn()} selectedInvoice={invoice()} />,
    )
    expect(screen.getByText("Total fee")).toBeDefined()
    expect(screen.getByText("Paid")).toBeDefined()
    expect(screen.getByText("Due")).toBeDefined()
    expect(screen.getByText("₹1,000")).toBeDefined()
    expect(screen.getByText("₹600")).toBeDefined()
    // Invoice-scoped, so a status badge is legitimate here (unlike on the
    // student-level money summary, which has no single invoice to describe).
    expect(screen.getByText("Partially paid")).toBeDefined()
  })

  it("omits the next-due line when the invoice has none", () => {
    mockInvoices([])
    render(
      <PaymentFormDialog
        open
        onOpenChange={vi.fn()}
        selectedInvoice={invoice({ nextDueDate: null })}
      />,
    )
    expect(screen.queryByText(/Next installment/)).toBeNull()
  })
})

describe("PaymentFormDialog global mode", () => {
  it("renders the invoice picker and fetches the global list", () => {
    mockInvoices([invoice()])
    render(<PaymentFormDialog open onOpenChange={vi.fn()} />)

    expect(invoicePicker()).not.toBeNull()
    expect(invoicesEnabled()).toBe(true)
  })

  it("offers invoices across many students", () => {
    mockInvoices([
      invoice(),
      invoice({
        id: "inv-2",
        invoiceNumber: "INV-2026-1002",
        student: { id: "stu-2", admissionNumber: "STU-2026-0002", fullName: "Bello Bala" },
      }),
    ])
    render(<PaymentFormDialog open onOpenChange={vi.fn()} />)

    // The global flow must remain cross-student; contextual mode is additive.
    expect(invoicePicker()).not.toBeNull()
  })

  it("still exposes the other payment fields", () => {
    mockInvoices([invoice()])
    render(<PaymentFormDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText(/amount/i)).toBeDefined()
    expect(screen.getByLabelText(/method/i)).toBeDefined()
    expect(screen.getByLabelText(/payment date/i)).toBeDefined()
  })

  // The label and the id it points at must appear together. A label whose
  // target has been removed is a control announced with no name.
  it("labels the picker, and the label resolves to the control", () => {
    mockInvoices([invoice()])
    render(<PaymentFormDialog open onOpenChange={vi.fn()} />)

    const picker = invoicePicker()
    expect(picker).not.toBeNull()
    expect(picker?.getAttribute("id")).toBe("payment-invoice")
    expect(screen.getByText("Invoice")).toBeDefined()
    // Resolves the same element the label names.
    expect(screen.getByLabelText("Invoice")).toBe(picker)
  })
})

describe("PaymentFormDialog global picker is unfiltered", () => {
  // The global picker is the pre-existing Payments-page control. This feature
  // added a contextual mode; it must not have narrowed the global one, so every
  // fetched invoice stays selectable regardless of status or balance.
  it("lists every fetched invoice, including settled and overdue ones", () => {
    mockInvoices([
      invoice({ id: "partial", status: "PARTIAL", balance: 600, invoiceNumber: "INV-PARTIAL" }),
      invoice({ id: "paid", status: "PAID", balance: 0, invoiceNumber: "INV-PAID" }),
      invoice({ id: "zero", status: "UNPAID", balance: 0, invoiceNumber: "INV-ZERO" }),
      invoice({ id: "overdue", status: "OVERDUE", balance: 250, invoiceNumber: "INV-OVERDUE" }),
    ])
    render(<PaymentFormDialog open onOpenChange={vi.fn()} />)

    const options = openInvoicePicker()
    expect(options).toHaveLength(4)
    for (const number of ["INV-PARTIAL", "INV-PAID", "INV-ZERO", "INV-OVERDUE"]) {
      expect(options.some((text) => text.includes(number))).toBe(true)
    }
  })
})
