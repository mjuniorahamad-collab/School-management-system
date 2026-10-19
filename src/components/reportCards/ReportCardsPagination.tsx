import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ReportCardPagination as ReportCardPaginationMeta } from "@/types/reportCard"

interface ReportCardsPaginationProps {
  pagination: ReportCardPaginationMeta
  onPageChange: (page: number) => void
}

export function ReportCardsPagination({ pagination, onPageChange }: ReportCardsPaginationProps) {
  const { page, pageSize, total, totalPages } = pagination

  if (total === 0) return null

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing{" "}
        <span className="font-medium text-foreground">
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
        </span>{" "}
        of <span className="font-medium text-foreground">{total}</span> report cards
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          Page <span className="font-medium text-foreground">{page}</span> of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
