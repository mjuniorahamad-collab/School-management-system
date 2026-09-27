// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { useFeeInvoices } from "@/hooks/useFeeInvoices"
import { useInvoicePayments, usePayments } from "@/hooks/usePayments"
import { feeInvoicesService } from "@/services/feeInvoicesService"
import { paymentsService } from "@/services/paymentsService"

// Proof that the `enabled` seams actually suppress the network call.
//
// The component tests elsewhere assert that the right `enabled` flag is passed
// and that the right markup is shown. Neither of those proves a request is not
// made - a card could hide a block while still hitting an endpoint the actor is
// not permitted to read. So these tests use the REAL hooks inside a real
// QueryClientProvider and spy on the SERVICES, which is the only layer where
// "was anything actually fetched" is answerable.
//
// Each negative case is paired with a control assertion that the same probe
// does fire the service when enabled. Without those controls a typo in a mock
// would make every "not called" assertion pass for the wrong reason.

vi.mock("@/services/paymentsService", () => ({ paymentsService: { list: vi.fn() } }))
vi.mock("@/services/feeInvoicesService", () => ({ feeInvoicesService: { list: vi.fn() } }))

const listPayments = vi.mocked(paymentsService.list)
const listInvoices = vi.mocked(feeInvoicesService.list)

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/**
 * Lets a query that was never scheduled have every chance to run anyway.
 * `waitFor` is useless for a negative assertion - it resolves the instant the
 * condition already holds - so negative cases settle on a real timer tick first.
 */
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  listPayments.mockReset()
  listInvoices.mockReset()
  listPayments.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } })
  listInvoices.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0 } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useInvoicePayments enabled gate", () => {
  it("does not call the payments service when disabled", async () => {
    const { result } = renderHook(
      () => useInvoicePayments("inv-1", 5, { enabled: false }),
      { wrapper: wrapper(makeClient()) },
    )

    await flush()
    expect(listPayments).not.toHaveBeenCalled()
    // A disabled query stays idle rather than silently loading.
    expect(result.current.fetchStatus).toBe("idle")
  })

  it("does not call the payments service for a null invoice id", async () => {
    // Even with enabled:true. A null id would otherwise be read as "no filter"
    // and pull every payment in the tenant, so the hook combines the two
    // conditions itself rather than trusting the caller.
    renderHook(() => useInvoicePayments(null, 5, { enabled: true }), {
      wrapper: wrapper(makeClient()),
    })

    await flush()
    expect(listPayments).not.toHaveBeenCalled()
  })

  // Control: proves the probe above is capable of observing a real call.
  it("calls the payments service when enabled, with the invoice id", async () => {
    renderHook(() => useInvoicePayments("inv-1", 5, { enabled: true }), {
      wrapper: wrapper(makeClient()),
    })

    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1))
    expect(listPayments).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "inv-1", pageSize: 5 }),
    )
  })

  it("defaults to enabled when no options are passed", async () => {
    renderHook(() => useInvoicePayments("inv-1"), { wrapper: wrapper(makeClient()) })
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1))
  })

  // Sharing the cache entry is what lets useCreatePayment's ["payments"] group
  // invalidation refresh this list; a separate query key would silently serve
  // stale rows after a collection. Rendering both hooks with the same query and
  // seeing a single service call is the direct proof.
  it("shares one cache entry with usePayments", async () => {
    const client = makeClient()
    const params = { invoiceId: "inv-1", pageSize: 5, sortBy: "paymentDate", sortDir: "desc" } as const
    renderHook(
      () => {
        useInvoicePayments("inv-1", 5)
        usePayments(params)
      },
      { wrapper: wrapper(client) },
    )

    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1))
    const entries = client.getQueryCache().findAll({ queryKey: ["payments"] })
    expect(entries).toHaveLength(1)
  })
})

describe("useFeeInvoices enabled gate", () => {
  // The scenario this whole feature is built around: a student whose session is
  // not ACTIVE. `sessionId: ""` serializes to no session filter at all, so
  // without the flag the server would read it as "every session for this
  // student" and return last year's invoice as if it were current.
  it("does not call the invoices service when the session gate is closed", async () => {
    renderHook(() => useFeeInvoices({ studentId: "stu-1", sessionId: "" }, { enabled: false }), {
      wrapper: wrapper(makeClient()),
    })

    await flush()
    expect(listInvoices).not.toHaveBeenCalled()
  })

  it("calls the invoices service when the gate is open, with both filters", async () => {
    renderHook(
      () => useFeeInvoices({ studentId: "stu-1", sessionId: "sess-1", pageSize: 1 }, { enabled: true }),
      { wrapper: wrapper(makeClient()) },
    )

    await waitFor(() => expect(listInvoices).toHaveBeenCalledTimes(1))
    expect(listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "stu-1", sessionId: "sess-1" }),
    )
  })

  // Control that documents why the flag is load-bearing rather than cosmetic:
  // with the gate open and no sessionId the service really is called with a
  // query carrying no session filter.
  it("demonstrates that an omitted sessionId means every session", async () => {
    renderHook(() => useFeeInvoices({ studentId: "stu-1" }, { enabled: true }), {
      wrapper: wrapper(makeClient()),
    })

    await waitFor(() => expect(listInvoices).toHaveBeenCalledTimes(1))
    expect(listInvoices.mock.calls[0][0]).not.toHaveProperty("sessionId")
  })

  it("keeps the pre-existing no-options call behaviour", async () => {
    renderHook(() => useFeeInvoices({ pageSize: 100 }), { wrapper: wrapper(makeClient()) })
    await waitFor(() => expect(listInvoices).toHaveBeenCalledTimes(1))
    expect(listInvoices).toHaveBeenCalledWith({ pageSize: 100 })
  })
})

describe("usePayments enabled gate", () => {
  it("defaults to enabled so the existing payments list is unaffected", async () => {
    renderHook(() => usePayments({ page: 1 }), { wrapper: wrapper(makeClient()) })
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1))
  })

  it("can be disabled without breaking the shared signature", async () => {
    renderHook(() => usePayments({ invoiceId: "inv-1" }, { enabled: false }), {
      wrapper: wrapper(makeClient()),
    })
    await flush()
    expect(listPayments).not.toHaveBeenCalled()
  })
})
