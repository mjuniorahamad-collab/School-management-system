import type { ReactNode } from "react"
import { Pencil } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

export interface Column {
  key: string
  header: string
  render: (item: Record<string, unknown>) => ReactNode
  cellClassName?: string
}

interface DataTableProps {
  columns: Column[]
  items: Array<Record<string, unknown>>
  isPending: boolean
  isError: boolean
  canEdit: boolean
  emptyLabel: string
  errorText: string
  onRetry: () => void
  onEdit: (item: Record<string, unknown>) => void
}

export function DataTable({
  columns,
  items,
  isPending,
  isError,
  canEdit,
  emptyLabel,
  errorText,
  onRetry,
  onEdit,
}: DataTableProps) {
  if (isPending) return <TableSkeleton />
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">{errorText}</p>
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
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm font-medium text-foreground">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-4 py-3 font-medium">
                  {column.header}
                </th>
              ))}
              {canEdit && <th scope="col" className="w-10 px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={String(item.id)} className="transition-colors hover:bg-muted/40">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 text-foreground ${column.cellClassName ?? ""}`}
                  >
                    {column.render(item)}
                  </td>
                ))}
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      aria-label="Edit row"
                      className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
