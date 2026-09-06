import { useCallback, useEffect, useRef, useState } from "react"
import { BookOpenText, Pencil, Plus, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { BookCopiesDialog } from "@/components/library/BookCopiesDialog"
import { BookFormDialog } from "@/components/library/BookFormDialog"
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
import { useLibraryBooks } from "@/hooks/useLibrary"
import { formatFullDate } from "@/lib/format"
import { LIBRARY_CATEGORY_LABELS, LIBRARY_CATEGORY_OPTIONS } from "@/types/library"
import type { LibraryBookListItem, LibraryCategory } from "@/types/library"

const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 20

export function BooksTab() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<LibraryCategory | "">("")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LibraryBookListItem | null>(null)
  const [copiesFor, setCopiesFor] = useState<LibraryBookListItem | null>(null)

  const searchRef = useRef("")
  useEffect(() => {
    searchRef.current = search
  }, [search])

  const commitSearch = useCallback((draft: string) => {
    setSearch(draft)
    setPage(1)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== searchRef.current) commitSearch(searchDraft)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, commitSearch])

  const { data, isPending, isError, refetch } = useLibraryBooks({
    search: search || undefined,
    category: category || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const items = data?.items ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1)

  const canView = can("library:view")
  const canCreate = can("library:create")
  const canUpdate = can("library:update")

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
            placeholder="Search title, author, ISBN…"
            aria-label="Search the library catalogue"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="shrink-0"
          >
            <Plus className="size-4" aria-hidden="true" />
            New Book
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value === "all" ? "" : (value as LibraryCategory))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-auto" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {LIBRARY_CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {LIBRARY_CATEGORY_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!canView ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          You do not have permission to view the library catalogue.
        </p>
      ) : (
        <BooksList
          items={items}
          isPending={isPending}
          isError={isError}
          canUpdate={canUpdate}
          onRetry={() => void refetch()}
          onEdit={(book) => {
            setEditing(book)
            setFormOpen(true)
          }}
          onCopies={(book) => setCopiesFor(book)}
        />
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Page {page} of {totalPages} · {total} book{total !== 1 ? "s" : ""}</span>
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

      <BookFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <BookCopiesDialog open={Boolean(copiesFor)} onOpenChange={(open) => !open && setCopiesFor(null)} book={copiesFor} />
    </div>
  )
}

function BooksList({
  items,
  isPending,
  isError,
  canUpdate,
  onRetry,
  onEdit,
  onCopies,
}: {
  items: LibraryBookListItem[]
  isPending: boolean
  isError: boolean
  canUpdate: boolean
  onRetry: () => void
  onEdit: (book: LibraryBookListItem) => void
  onCopies: (book: LibraryBookListItem) => void
}) {
  if (isPending) return <BooksSkeleton />

  if (isError) {
    return (
      <EmptyState message="Could not load the catalogue." actionLabel="Try again" onAction={onRetry} />
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="No books found"
        hint="Add a book to start building your library catalogue."
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Title</th>
                <th scope="col" className="px-4 py-3 font-medium">Author</th>
                <th scope="col" className="px-4 py-3 font-medium">Category</th>
                <th scope="col" className="px-4 py-3 font-medium">Copies</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Updated</th>
                <th scope="col" className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((book) => (
                <tr key={book.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onCopies(book)}
                      className="font-medium text-foreground hover:underline"
                    >
                      {book.title}
                    </button>
                    {book.isbn && <p className="text-xs text-muted-foreground">ISBN {book.isbn}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{book.author}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {LIBRARY_CATEGORY_LABELS[book.category]}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground tabular-nums">{book.availableCopies}</span>
                    <span className="text-muted-foreground"> / {book.totalCopies} available</span>
                  </td>
                  <td className="px-4 py-3">
                    <BookActiveBadge isActive={book.isActive} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatFullDate(book.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onCopies(book)}
                        aria-label={`Copies of ${book.title}`}
                        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <BookOpenText className="size-4" aria-hidden="true" />
                      </button>
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => onEdit(book)}
                          aria-label={`Edit ${book.title}`}
                          className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((book) => (
          <li key={book.id}>
            <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onCopies(book)}
                  className="truncate text-sm font-medium text-foreground hover:underline"
                >
                  {book.title}
                </button>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {book.author} · {LIBRARY_CATEGORY_LABELS[book.category]}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {book.availableCopies} / {book.totalCopies} available
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2">
                <BookActiveBadge isActive={book.isActive} />
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onCopies(book)}
                    aria-label={`Copies of ${book.title}`}
                    className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <BookOpenText className="size-4" aria-hidden="true" />
                  </button>
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => onEdit(book)}
                      aria-label={`Edit ${book.title}`}
                      className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function BookActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Inactive
    </span>
  )
}

function EmptyState({
  message,
  hint,
  actionLabel,
  onAction,
}: {
  message: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function BooksSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}