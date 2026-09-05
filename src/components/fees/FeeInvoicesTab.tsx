import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { GenerateInvoicesDialog } from "@/components/fees/GenerateInvoicesDialog"
import { InvoiceStatusBadge } from "@/components/fees/FeeStatusBadges"
import { InvoiceDetailDialog } from "@/components/fees/InvoiceDetailDialog"
import { FeeClassSelect } from "@/components/shared/FeeClassSelect"
import { FeeSessionSelect } from "@/components/shared/FeeSessionSelect"
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
import { useFeeInvoices } from "@/hooks/useFeeInvoices"
import { formatFullDate, formatINR } from "@/lib/format"
import { INVOICE_STATUS_OPTIONS } from "@/types/fees"
import type { FeeInvoiceListResult, InvoiceStatus } from "@/types/fees"

const SEARCH_DEBOUNCE_MS = 350

export function FeeInvoicesTab() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [classId, setClassId] = useState("")
  const [status, setStatus] = useState<string>("")
  const [generateOpen, setGenerateOpen] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

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

  const { data, isPending, isError, refetch } = useFeeInvoices({
    search: search || undefined,
    sessionId: sessionId || undefined,
    classId: classId || undefined,
    status: (status as InvoiceStatus) || undefined,
    pageSize: 50,
  })

  const canCreate = can("fees:create")

  return (
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
            placeholder="Search invoice, student…"
            aria-label="Search invoices"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={() => setGenerateOpen(true)} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            Generate Invoices
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FeeSessionSelect value={sessionId} onValueChange={(value) => setSessionId(value === "all" ? "" : (value ?? ""))} />
        <FeeClassSelect value={classId} onValueChange={(value) => setClassId(value === "all" ? "" : (value ?? ""))} />
        <Select value={status} onValueChange={(value) => setStatus(value === "all" ? "" : value)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Invoice status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INVOICE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <InvoicesList
        data={data}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
        onOpen={(id) => setSelectedInvoiceId(id)}
      />

      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoiceId(null)
        }}
      />
      <GenerateInvoicesDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  )
}

function InvoicesList({
  data,
  isPending,
  isError,
  onRetry,
  onOpen,
}: {
  data: FeeInvoiceListResult | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (id: string) => void
}) {
  if (isPending) return <InvoicesSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load invoices.</p>
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
        <p className="text-sm font-medium text-foreground">No invoices found</p>
        <p className="text-sm text-muted-foreground">
          Generate invoices for an active fee structure to start collecting.
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
                <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Class</th>
                <th scope="col" className="px-4 py-3 font-medium">Session</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Paid</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Balance</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Next due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((invoice) => (
                <tr
                  key={invoice.id}
                  onClick={() => onOpen(invoice.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{invoice.student.fullName}</p>
                    <p className="text-xs text-muted-foreground">{invoice.student.admissionNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {invoice.className}
                    {invoice.sectionName ? ` · ${invoice.sectionName}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{invoice.sessionName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(invoice.totalAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatINR(invoice.amountPaid)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatINR(invoice.balance)}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {invoice.nextDueDate ? formatFullDate(invoice.nextDueDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((invoice) => (
          <li key={invoice.id}>
            <button
              type="button"
              onClick={() => onOpen(invoice.id)}
              className="w-full rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground">{invoice.invoiceNumber}</span>
                <InvoiceStatusBadge status={invoice.status} />
              </span>
              <span className="mt-1 block text-sm font-medium text-foreground">
                {invoice.student.fullName}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {invoice.student.admissionNumber} · {invoice.className}
                {invoice.sectionName ? ` · ${invoice.sectionName}` : ""}
              </span>
              <span className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Due <span className="font-medium text-foreground tabular-nums">{formatINR(invoice.balance)}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  of {formatINR(invoice.totalAmount)} paid
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function InvoicesSkeleton() {
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