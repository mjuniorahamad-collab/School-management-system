import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CopyStatusBadge } from "@/components/library/libraryBadges"
import { useCreateLibraryCopy, useLibraryCopies, useUpdateLibraryCopyStatus } from "@/hooks/useLibrary"
import type { LibraryBookListItem, LibraryCopyStatus, LibraryCopyStatusPayload } from "@/types/library"

interface BookCopiesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: LibraryBookListItem | null
}

export function BookCopiesDialog({ open, onOpenChange, book }: BookCopiesDialogProps) {
  const bookId = book?.id ?? null
  const { data, isPending, isError, refetch } = useLibraryCopies(
    { bookId: bookId ?? undefined },
    open && Boolean(bookId),
  )
  const addCopy = useCreateLibraryCopy()

  const items = data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copies — {book?.title ?? "Book"}</DialogTitle>
          <DialogDescription>
            Physical copies of this title in the school library. Add copies to catalogue new
            acquisitions; loaned copies are returned through the issue/return flow.
          </DialogDescription>
        </DialogHeader>

        {isPending && <CopiesSkeleton />}

        {!isPending && isError && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">Could not load copies.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Try again
            </button>
          </div>
        )}

        {!isPending && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm font-medium text-foreground">No copies yet</p>
            <p className="text-sm text-muted-foreground">Add the first physical copy below.</p>
          </div>
        )}

        {!isPending && !isError && items.length > 0 && (
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {items.map((copy) => (
              <li
                key={copy.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">{copy.copyCode}</span>
                    <CopyStatusBadge status={copy.status} />
                  </span>
                  {copy.note && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{copy.note}</span>
                  )}
                </span>
                <CopyStatusControl copyId={copy.id} current={copy.status} />
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {data?.total ?? 0} copy{data?.total === 1 ? "" : "s"} ·{" "}
              {book ? `${book.availableCopies} available` : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (bookId) addCopy.mutate(bookId)
                }}
                disabled={addCopy.isPending || !bookId}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add copy
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CopyStatusControl({ copyId, current }: { copyId: string; current: LibraryCopyStatus }) {
  const update = useUpdateLibraryCopyStatus(copyId)

  if (current === "ISSUED") {
    return (
      <span className="text-xs text-muted-foreground" title="Return the loan first">
        On loan
      </span>
    )
  }

  const targets: LibraryCopyStatus[] = current === "AVAILABLE" ? ["LOST", "MAINTENANCE"] : ["AVAILABLE"]

  return (
    <Select
      value={current}
      onValueChange={(status) => {
        update.mutate({ status: status as LibraryCopyStatusPayload["status"] })
      }}
    >
      <SelectTrigger className="w-32" aria-label="Change copy status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {targets.map((status) => (
          <SelectItem key={status} value={status}>
            {status === "AVAILABLE" ? "Mark available" : status === "LOST" ? "Mark lost" : "Mark maintenance"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CopiesSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      ))}
    </div>
  )
}