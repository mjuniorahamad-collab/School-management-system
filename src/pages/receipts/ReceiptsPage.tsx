import { useCallback, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { ReceiptDetailDialog } from "@/components/receipts/ReceiptDetailDialog"
import { PaymentMethodLabel } from "@/components/fees/FeeStatusBadges"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useReceipts } from "@/hooks/useReceipts"
import { formatFullDate, formatINR } from "@/lib/format"
import type { ReceiptListResult } from "@/types/fees"

const SEARCH_DEBOUNCE_MS = 350

export function ReceiptsPage() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
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

  const canView = can("receipts:view")

  const { data, isPending, isError, refetch } = useReceipts({
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    pageSize: 50,
  })

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Receipts"
          description="Immutable records issued for every successful fee payment. Receipts cannot be edited or deleted."
        />

        {!canView ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view receipts.
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
                  placeholder="Search receipt, invoice, student…"
                  aria-label="Search receipts"
                  className="pl-9"
                />
              </div>
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

            <ReceiptsList
              data={data}
              isPending={isPending}
              isError={isError}
              onRetry={() => void refetch()}
              onOpen={(id) => setSelectedId(id)}
            />
          </div>
        )}

        <ReceiptDetailDialog
          receiptId={selectedId}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null)
          }}
        />
      </div>
    </PageContainer>
  )
}

function ReceiptsList({
  data,
  isPending,
  isError,
  onRetry,
  onOpen,
}: {
  data: ReceiptListResult | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (id: string) => void
}) {
  if (isPending) return <ReceiptsSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load receipts.</p>
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
        <p className="text-sm font-medium text-foreground">No receipts found</p>
        <p className="text-sm text-muted-foreground">
          Receipts appear automatically when a payment is recorded.
        </p>
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
                <th scope="col" className="px-4 py-3 font-medium">Receipt</th>
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Class</th>
                <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Balance after</th>
                <th scope="col" className="px-4 py-3 font-medium">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((receipt) => (
                <tr
                  key={receipt.id}
                  onClick={() => onOpen(receipt.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{receipt.receiptNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatFullDate(receipt.receiptDate)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{receipt.studentName}</p>
                    <p className="text-xs text-muted-foreground">{receipt.admissionNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {receipt.className}
                    {receipt.sectionName ? ` · ${receipt.sectionName}` : ""}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {receipt.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">
                    {formatINR(receipt.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                    {formatINR(receipt.balanceAfter)}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentMethodLabel method={receipt.method} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((receipt) => (
          <li key={receipt.id}>
            <button
              type="button"
              onClick={() => onOpen(receipt.id)}
              className="w-full rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground">{receipt.receiptNumber}</span>
                <span className="tabular-nums text-sm font-medium text-foreground">
                  {formatINR(receipt.amount)}
                </span>
              </span>
              <span className="mt-1 block text-sm font-medium text-foreground">{receipt.studentName}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {receipt.invoiceNumber} · {formatFullDate(receipt.receiptDate)}
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                Balance after: {formatINR(receipt.balanceAfter)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function ReceiptsSkeleton() {
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