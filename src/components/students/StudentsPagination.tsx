import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { StudentsPagination } from "@/types/students"

interface StudentsPaginationProps {
  pagination: StudentsPagination
  onPageChange: (page: number) => void
}

export function StudentsPagination({ pagination, onPageChange }: StudentsPaginationProps) {
  const { page, totalPages, total } = pagination

  if (total === 0) return null

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing{" "}
        <span className="font-medium text-foreground">
          {total === 0 ? 0 : (page - 1) * pagination.pageSize + 1}
          –{Math.min(page * pagination.pageSize, total)}
        </span>{" "}
        of <span className="font-medium text-foreground">{total}</span> students
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
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