import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { PaymentDetailDialog } from "@/components/payments/PaymentDetailDialog"
import { PaymentFormDialog } from "@/components/payments/PaymentFormDialog"
import { PaymentMethodLabel, PaymentStatusBadge } from "@/components/fees/FeeStatusBadges"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePayments } from "@/hooks/usePayments"
import { formatFullDate, formatINR } from "@/lib/format"
import { PAYMENT_METHOD_OPTIONS } from "@/types/fees"
import type { PaymentListResult, PaymentMethod } from "@/types/fees"

const SEARCH_DEBOUNCE_MS = 350

export function PaymentsPage() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [method, setMethod] = useState<string>("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const searchRef = useRef("")
  useEffect(() => {
    searchRef.current = search
  }, [search])

  const commitSearch = useCallback((draft: string) => setSearch(draft), [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== searchRef.current) commitSearch(searchDraft)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, commitSearch])

  const canView = can("payments:view")
  const canCreate = can("payments:create")

  const { data, isPending, isError, refetch } = usePayments({
    search: search || undefined,
    method: (method as PaymentMethod) || undefined,
    from: from || undefined,
    to: to || undefined,
    pageSize: 50,
  })

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Payments"
          description="Record fee payments against student invoices. Every payment issues an immutable receipt."
        />

        {!canView ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view payments.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search payment, invoice, student…"
                  aria-label="Search payments"
                  className="pl-9"
                />
              </div>
              {canCreate && (
                <Button onClick={() => setFormOpen(true)} className="shrink-0">
                  <Plus className="size-4" aria-hidden="true" />
                  Record Payment
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={method} onValueChange={(value) => setMethod(value === "all" ? "" : value)}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Payment method">
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1).toLowerCase().replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  aria-label="From date"
                  className="w-40"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  aria-label="To date"
                  className="w-40"
                />
              </div>
            </div>

            <PaymentsList
              data={data}
              isPending={isPending}
              isError={isError}
              onRetry={() => void refetch()}
              onOpen={(id) => setSelectedId(id)}
            />
          </div>
        )}

        <PaymentFormDialog open={formOpen} onOpenChange={setFormOpen} />
        <PaymentDetailDialog
          paymentId={selectedId}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null)
          }}
        />
      </div>
    </PageContainer>
  )
}

function PaymentsList({
  data,
  isPending,
  isError,
  onRetry,
  onOpen,
}: {
  data: PaymentListResult | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (id: string) => void
}) {
  if (isPending) return <PaymentsSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load payments.</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    )
  }

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">No payments found</p>
        <p className="text-sm text-muted-foreground">Record a payment against an invoice to get started.</p>
      </div>
    )
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Payment</th>
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 font-medium">Method</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 font-medium">Receipt</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((payment) => (
                <tr
                  key={payment.id}
                  onClick={() => onOpen(payment.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{payment.paymentNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatFullDate(payment.paymentDate)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{payment.invoice.student.fullName}</p>
                    <p className="text-xs text-muted-foreground">{payment.invoice.student.admissionNumber}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {payment.invoice.invoiceNumber}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentMethodLabel method={payment.method} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">
                    {formatINR(payment.amount)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {payment.receipt?.receiptNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={payment.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((payment) => (
          <li key={payment.id}>
            <button
              type="button"
              onClick={() => onOpen(payment.id)}
              className="w-full rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground">{payment.paymentNumber}</span>
                <PaymentStatusBadge status={payment.status} />
              </span>
              <span className="mt-1 block text-sm font-medium text-foreground">
                {payment.invoice.student.fullName}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {payment.invoice.invoiceNumber} · {formatFullDate(payment.paymentDate)}
              </span>
              <span className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {payment.receipt?.receiptNumber ?? "No receipt"}
                </span>
                <span className="font-medium text-foreground tabular-nums">{formatINR(payment.amount)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function PaymentsSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}