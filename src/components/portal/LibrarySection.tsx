import { BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { usePortalLibraryLoans } from "@/hooks/usePortal"
import { formatFullDate } from "@/lib/format"
import type { PortalLibraryLoanView } from "@/types/portal"

export function LibrarySection({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = usePortalLibraryLoans(studentId)

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />
  }
  if (isError || !data) {
    return <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Could not load library records.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {data.student.name} · {data.student.admissionNumber}
        </span>
      </div>

      {data.loans.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <BookOpen className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No library loans on record.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.loans.map((loan: PortalLibraryLoanView) => (
            <li key={loan.id} className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{loan.bookTitle}</p>
                <p className="font-mono text-xs text-muted-foreground">{loan.copyCode}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                {loan.isOverdue ? (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive">Overdue</Badge>
                ) : loan.returnedAt ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Returned</Badge>
                ) : (
                  <Badge variant="outline" className="bg-sky-500/10 text-sky-700 dark:text-sky-300">On loan</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {loan.returnedAt
                    ? `Returned ${formatFullDate(loan.returnedAt)}`
                    : `Due ${formatFullDate(loan.dueAt)}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}