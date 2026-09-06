import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { BookOpenText, Search, Users } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { useIssueLibraryLoan, useLibraryBooks, useLibraryBorrowers, useLibraryCopies } from "@/hooks/useLibrary"
import { LIBRARY_BORROWER_TYPE_LABELS, LIBRARY_BORROWER_TYPE_OPTIONS } from "@/types/library"
import type { LibraryBorrowerOption } from "@/types/library"
import {
  defaultIssueForm,
  issueFormToPayload,
  validateIssueForm,
} from "@/lib/libraryFormRules"
import type { IssueFormError, IssueFormValue } from "@/lib/libraryFormRules"

export function IssueLoanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [value, setValue] = useState<IssueFormValue>(defaultIssueForm)
  const [errors, setErrors] = useState<IssueFormError[]>([])
  const [bookSearch, setBookSearch] = useState("")
  const [borrowerSearch, setBorrowerSearch] = useState("")
  const issueLoan = useIssueLibraryLoan()

  const debouncedBookSearch = useDebouncedValue(bookSearch, 250)
  const debouncedBorrowerSearch = useDebouncedValue(borrowerSearch, 250)

  const booksQuery = useLibraryBooks({
    search: debouncedBookSearch || undefined,
    pageSize: 10,
  })
  const copiesQuery = useLibraryCopies(
    { bookId: value.bookId, status: "AVAILABLE" },
    Boolean(value.bookId) && open,
  )
  const borrowersQuery = useLibraryBorrowers(
    value.borrowerType,
    debouncedBorrowerSearch,
    open,
  )

  const selectBorrower = (borrower: LibraryBorrowerOption | undefined) => {
    setValue((current) => ({
      ...current,
      borrowerId: borrower?.id ?? "",
      borrowername: borrower ? `${borrower.name} (${borrower.code})` : "",
    }))
  }

  const selectBook = (book: { id: string; title: string } | undefined) => {
    setValue((current) => ({
      ...current,
      bookId: book?.id ?? "",
      bookTitle: book?.title ?? "",
      copyId: "",
      copyCode: "",
    }))
  }

  const selectCopy = (copy: { id: string; copyCode: string } | undefined) => {
    setValue((current) => ({
      ...current,
      copyId: copy?.id ?? "",
      copyCode: copy?.copyCode ?? "",
    }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateIssueForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    issueLoan.mutate(issueFormToPayload(value), { onSuccess: () => onOpenChange(false) })
  }

  const availableCopies = copiesQuery.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue a book</DialogTitle>
          <DialogDescription>
            Select a borrower and an available copy, then confirm the loan dates.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex max-h-[55vh] flex-col gap-5 overflow-y-auto pr-1">
            {/* Borrower */}
            <fieldset className="flex flex-col gap-2 rounded-lg p-1">
              <legend className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                Borrower
              </legend>
              <div className="flex gap-1.5">
                {LIBRARY_BORROWER_TYPE_OPTIONS.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setValue((current) => ({ ...current, borrowerType: type, borrowerId: "", borrowername: "" }))
                    }}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      value.borrowerType === type
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {LIBRARY_BORROWER_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  value={borrowerSearch}
                  onChange={(event) => setBorrowerSearch(event.target.value)}
                  placeholder={`Search ${LIBRARY_BORROWER_TYPE_LABELS[value.borrowerType].toLowerCase()}s by name or code…`}
                  aria-label="Search borrowers"
                  className="pl-9"
                />
              </div>
              <BorrowerPicker
                items={borrowersQuery.data ?? []}
                isPending={borrowersQuery.isPending}
                selectedId={value.borrowerId}
                onSelect={selectBorrower}
              />
            </fieldset>

            {/* Book + copy */}
            <fieldset className="flex flex-col gap-2 rounded-lg p-1">
              <legend className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <BookOpenText className="size-4 text-muted-foreground" aria-hidden="true" />
                Book and copy
              </legend>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  value={bookSearch}
                  onChange={(event) => {
                    setBookSearch(event.target.value)
                    selectBook(undefined)
                  }}
                  placeholder="Search books by title, author, ISBN…"
                  aria-label="Search the catalogue"
                  className="pl-9"
                />
              </div>
              <BookPicker
                items={booksQuery.data?.items ?? []}
                isPending={booksQuery.isPending}
                selectedId={value.bookId}
                onSelect={selectBook}
              />
              {value.bookId && (
                <CopyPicker
                  items={availableCopies}
                  isPending={copiesQuery.isPending}
                  selectedId={value.copyId}
                  onSelect={selectCopy}
                />
              )}
            </fieldset>

            {/* Dates */}
            <fieldset className="grid gap-3 rounded-lg p-1 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-date">Issue date</Label>
                <Input
                  id="issue-date"
                  type="date"
                  value={value.issueDate}
                  onChange={(event) => setValue({ ...value, issueDate: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="due-date">Due date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={value.dueDate}
                  min={value.issueDate}
                  onChange={(event) => setValue({ ...value, dueDate: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="loan-notes">Notes</Label>
                <Textarea
                  id="loan-notes"
                  value={value.notes}
                  onChange={(event) => setValue({ ...value, notes: event.target.value })}
                  rows={2}
                  placeholder="Optional note, e.g. condition, special instructions…"
                />
              </div>
            </fieldset>

            {value.copyCode && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Issuing <span className="font-medium text-foreground">{value.bookTitle}</span> ({value.copyCode}) to{" "}
                <span className="font-medium text-foreground">{value.borrowername}</span>.
              </p>
            )}

            {errors.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {errors.map((error) => (
                  <li key={error.field}>{error.message}</li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={issueLoan.isPending}>
                {issueLoan.isPending ? "Issuing..." : "Issue book"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function BorrowerPicker({
  items,
  isPending,
  selectedId,
  onSelect,
}: {
  items: LibraryBorrowerOption[]
  isPending: boolean
  selectedId: string
  onSelect: (borrower: LibraryBorrowerOption | undefined) => void
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No matching borrowers.</p>
  }
  return (
    <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto pr-1" role="listbox" aria-label="Borrowers">
      {items.map((borrower) => (
        <li key={borrower.id}>
          <button
            type="button"
            role="option"
            aria-selected={borrower.id === selectedId}
            onClick={() => onSelect(borrower)}
            className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              borrower.id === selectedId
                ? "border-primary bg-primary/5 text-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="truncate">{borrower.name}</span>
            <span className="shrink-0 font-mono text-xs">{borrower.code}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function BookPicker({
  items,
  isPending,
  selectedId,
  onSelect,
}: {
  items: { id: string; title: string; author: string; totalCopies: number; availableCopies: number }[]
  isPending: boolean
  selectedId: string
  onSelect: (book: { id: string; title: string } | undefined) => void
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No matching books.</p>
  }
  return (
    <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto pr-1" role="listbox" aria-label="Books">
      {items.map((book) => (
        <li key={book.id}>
          <button
            type="button"
            role="option"
            aria-selected={book.id === selectedId}
            onClick={() => onSelect(book)}
            disabled={book.availableCopies === 0}
            className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
              book.id === selectedId
                ? "border-primary bg-primary/5 text-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate">{book.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{book.author}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums">
              {book.availableCopies} available
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function CopyPicker({
  items,
  isPending,
  selectedId,
  onSelect,
}: {
  items: { id: string; copyCode: string }[]
  isPending: boolean
  selectedId: string
  onSelect: (copy: { id: string; copyCode: string } | undefined) => void
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No available copies of this book right now.</p>
  }
  return (
    <ul className="flex max-h-28 flex-col gap-1 overflow-y-auto pr-1" role="listbox" aria-label="Available copies">
      {items.map((copy) => (
        <li key={copy.id}>
          <button
            type="button"
            role="option"
            aria-selected={copy.id === selectedId}
            onClick={() => onSelect(copy)}
            className={`flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              copy.id === selectedId
                ? "border-primary bg-primary/5 text-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="font-mono text-sm">{copy.copyCode}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}