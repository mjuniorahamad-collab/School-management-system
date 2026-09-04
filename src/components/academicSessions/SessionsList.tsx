import { Pencil } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionStatusBadge } from "@/components/academicSessions/SessionStatusBadge"
import { formatFullDate } from "@/lib/format"
import type { AcademicSessionListItem } from "@/types/academicSessions"

interface SessionsViewProps {
  items: AcademicSessionListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  onRetry: () => void
  onEdit: (session: AcademicSessionListItem) => void
}

export function SessionsTable({
  items,
  isPending,
  isError,
  canEdit,
  onRetry,
  onEdit,
}: SessionsViewProps) {
  if (isPending) return <SessionsTableSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load academic sessions.</p>
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
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">No academic sessions found</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting the search or filters, or create a new academic session.
        </p>
      </div>
    )
  }

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Session</th>
              <th scope="col" className="px-4 py-3 font-medium">Code</th>
              <th scope="col" className="px-4 py-3 font-medium">Start</th>
              <th scope="col" className="px-4 py-3 font-medium">End</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              {canEdit && <th scope="col" className="w-10 px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((session) => (
              <tr key={session.id} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{session.name}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                  {session.code}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {formatFullDate(session.startDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {formatFullDate(session.endDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <SessionStatusBadge status={session.status} />
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(session)}
                      aria-label={`Edit ${session.name}`}
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

export function SessionsCards({
  items,
  isPending,
  isError,
  canEdit,
  onRetry,
  onEdit,
}: SessionsViewProps) {
  if (isPending) return <SessionsCardsSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center md:hidden">
        <p className="text-sm text-muted-foreground">Could not load academic sessions.</p>
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
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center md:hidden">
        <p className="text-sm font-medium text-foreground">No academic sessions found</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting the search or filters, or create a new academic session.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((session) => (
        <li key={session.id}>
          <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{session.name}</span>
                <SessionStatusBadge status={session.status} />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {session.code} · {formatFullDate(session.startDate)} – {formatFullDate(session.endDate)}
              </span>
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(session)}
                aria-label={`Edit ${session.name}`}
                className="inline-flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function SessionsTableSkeleton() {
  return (
    <div className="hidden rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:block">
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

function SessionsCardsSkeleton() {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
