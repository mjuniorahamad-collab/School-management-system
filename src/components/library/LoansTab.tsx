import { useEffect, useRef, useState } from "react"
import { ArrowLeftRight, Search, Undo2 } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { LoanStatusBadge } from "@/components/library/libraryBadges"
import { IssueLoanDialog } from "@/components/library/IssueLoanDialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useLibraryLoans, useReturnLibraryLoan } from "@/hooks/useLibrary"
import { LIBRARY_BORROWER_TYPE_LABELS } from "@/types/library"
import type { LibraryLoanListItem } from "@/types/library"

const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 20
type LoanFilter = "all" | "active" | "overdue" | "returned"
const FILTERS: Array<{ value: LoanFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "On loan" },
  { value: "overdue", label: "Overdue" },
  { value: "returned", label: "Returned" },
]

export function LoansTab() {
  const { can } = useAuth()
  const [filter, setFilter] = useState<LoanFilter>("all")
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [issueOpen, setIssueOpen] = useState(false)
  const [returning, setReturning] = useState<LibraryLoanListItem | null>(null)

  const searchRef = useRef("")
  useEffect(() => {
    searchRef.current = search
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== searchRef.current) {
        setSearch(searchDraft)
        setPage(1)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft])

  const { data, isPending, isError, refetch } = useLibraryLoans({
    status: filter === "all" ? undefined : filter,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const items = data?.items ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1)

  const canView = can("library:view")
  const canIssue = can("library:issue")
  const canReturn = can("library:return")

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
            placeholder="Search book, copy, borrower…"
            aria-label="Search loans"
            className="pl-9"
          />
        </div>
        {canIssue && (
          <Button className="shrink-0" onClick={() => setIssueOpen(true)}>
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            Issue a book
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setFilter(option.value)
              setPage(1)
            }}
            aria-pressed={filter === option.value}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              filter === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!canView ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          You do not have permission to view library loans.
        </p>
      ) : (
        <>
          <LoansList
            items={items}
            isPending={isPending}
            isError={isError}
            canReturn={canReturn}
            onRetry={() => void refetch()}
            onReturn={(loan) => setReturning(loan)}
          />
          {items.length > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Page {page} of {totalPages} · {total} loan{total !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
                >
                  ← Prev
                </button>
                <span>Page {page}</span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <IssueLoanDialog key={issueOpen ? "open" : "closed"} open={issueOpen} onOpenChange={setIssueOpen} />
      <ReturnLoanDialog loan={returning} onClose={() => setReturning(null)} />
    </div>
  )
}

function LoansList({
  items,
  isPending,
  isError,
  canReturn,
  onRetry,
  onReturn,
}: {
  items: LibraryLoanListItem[]
  isPending: boolean
  isError: boolean
  canReturn: boolean
  onRetry: () => void
  onReturn: (loan: LibraryLoanListItem) => void
}) {
  if (isPending) return <LoansSkeleton />
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load loans.</p>
        <button type="button" onClick={onRetry} className="rounded text-sm font-medium text-primary hover:underline">
          Try again
        </button>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">No loans found</p>
        <p className="text-sm text-muted-foreground">Use “Issue a book” to start circulation.</p>
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
                <th scope="col" className="px-4 py-3 font-medium">Book</th>
                <th scope="col" className="px-4 py-3 font-medium">Borrower</th>
                <th scope="col" className="px-4 py-3 font-medium">Issued</th>
                <th scope="col" className="px-4 py-3 font-medium">Due</th>
                <th scope="col" className="px-4 py-3 font-medium">Returned</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((loan) => (
                <tr key={loan.id} className="transition-colors hover:bg-muted/40">
                  <td className="max-w-56 px-4 py-3">
                    <span className="block truncate font-medium text-foreground">{loan.bookTitle}</span>
                    <span className="font-mono text-xs text-muted-foreground">{loan.copyCode}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-foreground">{loan.borrowerName}</span>
                    <span className="text-xs text-muted-foreground">
                      {LIBRARY_BORROWER_TYPE_LABELS[loan.borrowerType]} · {loan.borrowerCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{loan.issuedAt}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{loan.dueAt}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{loan.returnedAt ?? "—"}</td>
                  <td className="px-4 py-3"><LoanStatusBadge status={loan.status} /></td>
                  <td className="px-4 py-3">
                    {canReturn && loan.status !== "RETURNED" && (
                      <button
                        type="button"
                        onClick={() => onReturn(loan)}
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Undo2 className="size-3.5" aria-hidden="true" />
                        Return
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((loan) => (
          <li key={loan.id}>
            <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{loan.bookTitle}</span>
                  <span className="font-mono text-xs text-muted-foreground">{loan.copyCode}</span>
                </span>
                <LoanStatusBadge status={loan.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{loan.borrowerName}</span> ·{" "}
                {LIBRARY_BORROWER_TYPE_LABELS[loan.borrowerType]} · {loan.borrowerCode}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                Issued {loan.issuedAt} · Due {loan.dueAt}
                {loan.returnedAt ? ` · Returned ${loan.returnedAt}` : ""}
              </p>
              {canReturn && loan.status !== "RETURNED" && (
                <button
                  type="button"
                  onClick={() => onReturn(loan)}
                  className="mt-3 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Undo2 className="size-3.5" aria-hidden="true" />
                  Return
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function LoansSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ReturnLoanDialog({ loan, onClose }: { loan: LibraryLoanListItem | null; onClose: () => void }) {
  const returnLoan = useReturnLibraryLoan()

  return (
    <Dialog open={Boolean(loan)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return this book?</DialogTitle>
          <DialogDescription>
            {loan ? (
              <>
                <span className="font-medium text-foreground">{loan.bookTitle}</span> ({loan.copyCode}) borrowed by{" "}
                <span className="font-medium text-foreground">{loan.borrowerName}</span> will be marked returned and
                the copy will become available again.
              </>
            ) : (
              "Mark this loan as returned."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (loan) returnLoan.mutate(loan.id, { onSuccess: onClose })
              }}
              disabled={returnLoan.isPending || !loan}
            >
              {returnLoan.isPending ? "Returning..." : "Confirm return"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}