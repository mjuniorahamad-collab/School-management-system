import { Badge } from "@/components/ui/badge"
import type { LibraryCopyStatus, LibraryLoanStatus } from "@/types/library"
import { LIBRARY_COPY_STATUS_LABELS, LIBRARY_LOAN_STATUS_LABELS } from "@/types/library"

const copyStatusStyles: Record<LibraryCopyStatus, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  ISSUED: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
  LOST: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
  MAINTENANCE: "bg-amber-50 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-300",
}

const loanStatusStyles: Record<LibraryLoanStatus, string> = {
  ON_LOAN: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
  OVERDUE: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
  RETURNED: "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-500/15 dark:text-slate-300",
}

export function CopyStatusBadge({ status }: { status: LibraryCopyStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${copyStatusStyles[status]}`}>
      {LIBRARY_COPY_STATUS_LABELS[status]}
    </Badge>
  )
}

export function LoanStatusBadge({ status }: { status: LibraryLoanStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${loanStatusStyles[status]}`}>
      {LIBRARY_LOAN_STATUS_LABELS[status]}
    </Badge>
  )
}