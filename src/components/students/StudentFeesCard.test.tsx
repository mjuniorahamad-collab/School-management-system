// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { StudentFeesCard } from "@/components/students/StudentFeesCard"
import type { FeeInvoiceListItem, PaymentListItem } from "@/types/fees"

// DOM tests for the student-level fee summary.
//
// The two data hooks are the seam: mocking them keeps the test free of a
// QueryClientProvider, services and a router while still exercising the real
// card markup, the real MoneyCell, and the real Button.
//
// The assertions that matter here are about what the card does NOT do. Both
// reads are permission- and state-gated, and a card that merely hides a block
// while the request still fires would be a security-relevant defect: it would
// keep hitting a fees/payments endpoint the actor may not be allowed to read.
// So the mock records the `enabled` flag it was handed and every test asserts
// on that flag, not just on presence or absence of markup. `useAuth` is mocked
// the same way, because the house pattern is that components own `can()` and
// pass a plain boolean down to hooks (no hook in src/hooks calls useAuth).

const { useAuthMock, invoiceHook, paymentsHook, refetchInvoices } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  invoiceHook: vi.fn(),
  paymentsHook: vi.fn(),
  refetchInvoices: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: useAuthMock }))
vi.mock("@/hooks/useFeeInvoices", () => ({ useFeeInvoices: invoiceHook }))
vi.mock("@/hooks/usePayments", () => ({
  useInvoicePayments: paymentsHook,
  useCreatePayment: () => ({ mutate: vi.fn(), isPending: false }),
}))

// The dialogs are only mounts from this card's perspective; their behaviour is
// covered by PaymentFormDialog.test.tsx and the integration suite.
vi.mock("@/components/payments/PaymentFormDialog", () => ({
  PaymentFormDialog: () => null,
}))
vi.mock("@/components/payments/PaymentDetailDialog", () => ({
  PaymentDetailDialog: () => null,
}))
const invoiceDetailSpy = vi.fn()
vi.mock("@/components/fees/InvoiceDetailDialog", () => ({
  InvoiceDetailDialog: ({ invoiceId }: { invoiceId: string | null }) => {
    invoiceDetailSpy(invoiceId)
    return null
  },
}))
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}))

type InvoiceState =
  | {
      data?: { items: FeeInvoiceListItem[] }
      isPending?: boolean
      isError?: boolean
      refetch?: () => void
    }
  | undefined

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

function payment(overrides: Partial<PaymentListItem> = {}): PaymentListItem {
  return {
    id: "pay-1",
    paymentNumber: "PAY-2026-0001",
    amount: 400,
    method: "CASH",
    transactionRef: null,
    paymentDate: "2026-09-01T00:00:00.000Z",
    status: "SUCCESS",
    invoice: {
      id: "inv-1",
      invoiceNumber: "INV-2026-1001",
      student: { id: "stu-1", admissionNumber: "STU-2026-0001", fullName: "Amina Adamu" },
    },
    receipt: { id: "rct-1", receiptNumber: "RCT-2026-0001" },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

/** Reads the `enabled` flag the card handed to the invoice query. */
function invoiceEnabled(): unknown {
  expect(invoiceHook).toHaveBeenCalled()
  return invoiceHook.mock.calls[0][1]?.enabled
}

/** Reads the `enabled` flag the card handed to the invoice-payments query. */
function paymentsEnabled(): unknown {
  expect(paymentsHook).toHaveBeenCalled()
  return paymentsHook.mock.calls[0][2]?.enabled
}

const collectButton = () => screen.queryByRole("button", { name: /collect fee/i })

interface RenderOptions {
  props?: Partial<Parameters<typeof StudentFeesCard>[0]>
  permissions?: { viewPayments?: boolean; createPayments?: boolean }
  invoiceState?: InvoiceState
  payments?: { items: PaymentListItem[] }
}

function renderCard({
  props = {},
  permissions = {},
  invoiceState,
  payments,
}: RenderOptions = {}) {
  useAuthMock.mockReturnValue({
    can: (permission: string) => {
      if (permission === "payments:view") return permissions.viewPayments ?? true
      if (permission === "payments:create") return permissions.createPayments ?? true
      return true
    },
  })
  invoiceHook.mockReturnValue(
    invoiceState ?? {
      data: { items: [invoice()] },
      isPending: false,
      isError: false,
      refetch: refetchInvoices,
    },
  )
  paymentsHook.mockReturnValue({
    data: { items: payments?.items ?? [] },
    isPending: false,
    isError: false,
  })

  return render(
    <StudentFeesCard
      studentId="stu-1"
      sessionId="sess-1"
      sessionName="Fees Year"
      sessionStatus="ACTIVE"
      {...props}
    />,
  )
}

describe("StudentFeesCard", () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    invoiceHook.mockReset()
    paymentsHook.mockReset()
    refetchInvoices.mockReset()
    invoiceDetailSpy.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  // ---------------------------------------------------------------- money

  it("shows the authoritative total, paid and due figures", () => {
    renderCard()
    expect(screen.getByText("Total fee")).toBeDefined()
    expect(screen.getByText("Paid")).toBeDefined()
    expect(screen.getByText("Due")).toBeDefined()
    // 1000 total, 400 paid, 600 due.
    expect(screen.getByText("₹1,000")).toBeDefined()
    expect(screen.getByText("₹400")).toBeDefined()
    expect(screen.getByText("₹600")).toBeDefined()
  })

  it("does not render an aggregate invoice status badge", () => {
    renderCard()
    // The card is a money summary; PARTIAL/UNPAID are installment-order
    // semantics that would misrepresent a single figure, so no badge appears.
    expect(screen.queryByText("Partially paid")).toBeNull()
    expect(screen.queryByText("Unpaid")).toBeNull()
    expect(screen.queryByText("Overdue")).toBeNull()
  })

  // ------------------------------------------------- CORRECTION 3: session

  it("queries the invoice only for an ACTIVE session with a session id", () => {
    renderCard()
    expect(invoiceEnabled()).toBe(true)
    expect(invoiceHook.mock.calls[0][0]).toMatchObject({
      studentId: "stu-1",
      sessionId: "sess-1",
      pageSize: 1,
    })
  })

  // The session is the student's own ACTIVE enrollment. Fetching anyway would
  // surface an older session's invoice as if it were the current one, so the
  // query must be suppressed entirely - not merely hidden.
  it.each(["UPCOMING", "ARCHIVED"])(
    "suppresses the invoice query for a %s session",
    (status) => {
      renderCard({ props: { sessionStatus: status as "UPCOMING" | "ARCHIVED" } })
      expect(invoiceEnabled()).toBe(false)
    },
  )

  it("suppresses the invoice query when there is no session id", () => {
    renderCard({ props: { sessionId: "" } })
    expect(invoiceEnabled()).toBe(false)
  })

  it("does not fetch payment history for a non-ACTIVE session", () => {
    renderCard({ props: { sessionStatus: "ARCHIVED" } })
    // The payments hook is still called - hooks cannot be conditional - but it
    // must be told not to fetch.
    expect(paymentsEnabled()).toBe(false)
    expect(collectButton()).toBeNull()
  })

  it("renders no money figures when the session is not ACTIVE", () => {
    renderCard({ props: { sessionStatus: "ARCHIVED" } })
    expect(screen.queryByText("Total fee")).toBeNull()
    expect(screen.queryByText("Due")).toBeNull()
  })

  it("cannot express an unfiltered cross-session read when the session is not ACTIVE", () => {
    renderCard({ props: { sessionStatus: "ARCHIVED" } })
    // The dangerous shape would be `sessionId: undefined` alongside a truthy
    // studentId, which the server reads as "every session for this student".
    // The enabled flag is the only thing standing between the two, so assert
    // the flag rather than the query object's shape.
    expect(invoiceHook.mock.calls[0][1]?.enabled).toBe(false)
  })

  it("explains the empty card when the session is not ACTIVE", () => {
    renderCard({ props: { sessionStatus: "ARCHIVED" } })
    // A blank body would read as "this student owes nothing", which is a
    // materially different - and wrong - statement.
    expect(screen.getByText(/only shown for the current academic session/i)).toBeTruthy()
    expect(screen.getByText(/not the current session/i)).toBeTruthy()
  })

  it("explains the empty card when there is no session enrollment at all", () => {
    renderCard({ props: { sessionId: "" } })
    expect(screen.getByText(/no academic session enrollment/i)).toBeTruthy()
  })

  it("never mentions an older session's invoice while refusing to show it", () => {
    renderCard({ props: { sessionStatus: "ARCHIVED" } })
    // The explanation must not become a back door: no invoice number, no money
    // figure and no installment date from the non-current session. These are the
    // fixture's real values, so the assertions cannot pass vacuously.
    expect(screen.queryByText("INV-2026-1001")).toBeNull()
    expect(screen.queryByText("₹1,000")).toBeNull()
    expect(screen.queryByText("₹400")).toBeNull()
    expect(screen.queryByText("₹600")).toBeNull()
    expect(screen.queryByText(/Next installment/)).toBeNull()
  })

  it("does not render the empty-session state when the session is ACTIVE", () => {
    renderCard()
    expect(screen.queryByText(/only shown for the current academic session/i)).toBeNull()
  })

  it("opens the invoice breakdown from the invoice number", () => {
    renderCard()
    // Closed by default, so the dialog is not mounted with an id yet.
    expect(invoiceDetailSpy).toHaveBeenLastCalledWith(null)

    fireEvent.click(screen.getByRole("button", { name: "INV-2026-1001" }))
    expect(invoiceDetailSpy).toHaveBeenLastCalledWith("inv-1")
  })

  it("exposes the invoice number as a real button for keyboard users", () => {
    renderCard()
    const trigger = screen.getByRole("button", { name: "INV-2026-1001" })
    expect(trigger.tagName).toBe("BUTTON")
    expect(trigger.getAttribute("type")).toBe("button")
  })

  it("offers no invoice drill-down when the session is not ACTIVE", () => {
    renderCard({ props: { sessionStatus: "ARCHIVED" } })
    // There is no invoice to open, so the affordance must not be present.
    expect(screen.queryByRole("button", { name: /INV-/ })).toBeNull()
    expect(invoiceDetailSpy).toHaveBeenLastCalledWith(null)
  })

  // ------------------------------------------- CORRECTION 1: RBAC gating

  it("disables the payment history query when payments:view is missing", () => {
    renderCard({ permissions: { viewPayments: false } })
    expect(paymentsEnabled()).toBe(false)
  })

  it("renders no payment history block without payments:view", () => {
    renderCard({ permissions: { viewPayments: false } })
    expect(screen.queryByText("Recent payments")).toBeNull()
  })

  // fees:view gates the whole card, payments:view only the history. An actor
  // who can read invoices but not payments must still see the money summary.
  it("still shows the money summary and collection without payments:view", () => {
    renderCard({ permissions: { viewPayments: false } })
    expect(screen.getByText("Total fee")).toBeDefined()
    expect(screen.getByText("₹600")).toBeDefined()
    expect(collectButton()).not.toBeNull()
  })

  it("hides the Collect fee button without payments:create", () => {
    renderCard({ permissions: { createPayments: false } })
    expect(collectButton()).toBeNull()
  })

  const fullyPaid = () => ({
    data: { items: [invoice({ balance: 0, amountPaid: 1000, status: "PAID" as const })] },
    isPending: false,
    isError: false,
    refetch: refetchInvoices,
  })

  it("keeps fetching payment history for a fully paid invoice", () => {
    renderCard({ invoiceState: fullyPaid() })
    // Regression: history is a read path. A settled invoice is the one whose
    // payments explain how it settled, so `due > 0` must NOT gate the query.
    expect(paymentsEnabled()).toBe(true)
    expect(paymentsHook.mock.calls[0][0]).toBe("inv-1")
  })

  it("renders the payments that produced the fully paid state", () => {
    // The fully-paid summary and its history must be visible at the same time.
    // Distinct amounts, and distinct from the fully paid summary's
    // 1,000 / 1,000 / 0, so each figure is unambiguously a payment row.
    renderCard({
      invoiceState: fullyPaid(),
      payments: { items: [payment({ amount: 500, method: "BANK_TRANSFER" }), payment({ id: "pay-2", amount: 250 })] },
    })
    expect(screen.getByText("This session's fees are fully paid.")).toBeDefined()
    expect(screen.getByText("Recent payments")).toBeDefined()
    expect(screen.getByText("₹500")).toBeDefined()
    expect(screen.getByText("₹250")).toBeDefined()
    expect(collectButton()).toBeNull()
  })

  it("makes no payment-history query when the session has no invoice", () => {
    renderCard({ invoiceState: { data: { items: [] }, isPending: false, isError: false } })
    // No invoice means no invoiceId, so there is nothing invoice-scoped to read.
    expect(paymentsEnabled()).toBe(false)
    expect(paymentsHook.mock.calls[0][0]).toBeNull()
  })

  it("confirms a fully paid session and offers no collection", () => {
    renderCard({ invoiceState: fullyPaid() })
    expect(screen.getByText("This session's fees are fully paid.")).toBeDefined()
    expect(collectButton()).toBeNull()
  })

  // Defense in depth, deliberately an unreachable state under today's server
  // rules: `deriveInvoiceStatus` returns PAID only when no installment owes
  // money, so a PAID invoice cannot carry a positive balance. This fixture
  // pins that the card's gate does not silently RELY on that relationship - if
  // someone later reduces the gate back to `balance > 0`, this test fails.
  it("withholds collection from a PAID invoice that still reports a balance", () => {
    renderCard({
      invoiceState: {
        data: { items: [invoice({ balance: 600, amountPaid: 400, status: "PAID" })] },
        isPending: false,
        isError: false,
        refetch: refetchInvoices,
      },
    })
    // The balance is still read for display; only the write action is withheld.
    expect(screen.getByText("₹600")).toBeDefined()
    expect(collectButton()).toBeNull()
  })

  // ------------------------------------------------------------- overdue

  const overdue = () => ({
    data: { items: [invoice({ balance: 600, amountPaid: 400, status: "OVERDUE" as const })] },
    isPending: false,
    isError: false,
    refetch: refetchInvoices,
  })

  it("recognises an overdue invoice and shows the amount due", () => {
    renderCard({ invoiceState: overdue() })
    // Total 1,000 / paid 400 / due 600 - the card must not treat OVERDUE as
    // settled and collapse or zero the due figure.
    expect(screen.getByText("Total fee")).toBeDefined()
    expect(screen.getByText("₹400")).toBeDefined()
    expect(screen.getByText("₹600")).toBeDefined()
    expect(screen.getByText("INV-2026-1001")).toBeDefined()
    // Not the fully-paid copy, and no misleading status badge either.
    expect(screen.queryByText("This session's fees are fully paid.")).toBeNull()
    expect(screen.queryByText("Overdue")).toBeNull()
  })

  it("keeps an overdue invoice collectible", () => {
    renderCard({ invoiceState: overdue() })
    // Overdue is precisely the invoice a bursar most needs to collect, so the
    // status must not remove the Collect fee action.
    expect(collectButton()).not.toBeNull()
  })

  it("withholds an overdue invoice only for lack of payments:create", () => {
    renderCard({ invoiceState: overdue(), permissions: { createPayments: false } })
    // Proves the button is withheld by the permission, not by the OVERDUE
    // status: the invoice itself is still collectible.
    expect(screen.getByText("₹600")).toBeDefined()
    expect(collectButton()).toBeNull()
  })

  // ------------------------------------------------------------- history

  it("enables the payment history query when permitted and due", () => {
    renderCard()
    expect(paymentsEnabled()).toBe(true)
    expect(paymentsHook.mock.calls[0][0]).toBe("inv-1")
    expect(paymentsHook.mock.calls[0][1]).toBe(5)
  })

  it("renders no history block when the invoice has no payments", () => {
    renderCard()
    // Zero payments is not an empty section; the block is simply absent.
    expect(screen.queryByText("Recent payments")).toBeNull()
  })

  it("lists payments when they exist", () => {
    // Distinct from the money strip's 1,000 / 400 / 600 so each figure is
    // unambiguously the payment row's amount.
    renderCard({ payments: { items: [payment({ amount: 250 }), payment({ id: "pay-2", amount: 100 })] } })
    expect(screen.getByText("Recent payments")).toBeDefined()
    expect(screen.getByText("₹250")).toBeDefined()
    expect(screen.getByText("₹100")).toBeDefined()
  })

  // -------------------------------------------------- loading and failure

  it("shows a skeleton while the invoice loads", () => {
    renderCard({ invoiceState: { data: undefined, isPending: true, isError: false } })
    expect(screen.queryByText("Total fee")).toBeNull()
    expect(screen.queryByText("Could not load fee information for this session.")).toBeNull()
  })

  it("offers a retry when the invoice query fails", () => {
    renderCard({ invoiceState: { data: undefined, isPending: false, isError: true, refetch: refetchInvoices } })
    expect(screen.getByText("Could not load fee information for this session.")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(refetchInvoices).toHaveBeenCalled()
  })

  it("offers a link to fees when the session has no invoice", () => {
    renderCard({ invoiceState: { data: { items: [] }, isPending: false, isError: false } })
    expect(screen.getByText("No fee invoice has been generated for Fees Year.")).toBeDefined()
    // No zeroed money strip for a student who simply has no invoice yet.
    expect(screen.queryByText("Total fee")).toBeNull()
    expect(collectButton()).toBeNull()
  })
})
