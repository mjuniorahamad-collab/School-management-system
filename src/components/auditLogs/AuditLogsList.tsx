import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/format"
import { formatAuditAction, formatAuditEntity, type AuditLogListItem } from "@/types/auditLogs"

interface AuditLogsViewProps {
  items: AuditLogListItem[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onSelect: (item: AuditLogListItem) => void
}

export function AuditLogsTable({ items, isPending, isError, onRetry, onSelect }: AuditLogsViewProps) {
  if (isPending) return <AuditLogsSkeleton table />
  if (isError) return <ErrorState text="Could not load the audit trail." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">When</th>
              <th scope="col" className="px-4 py-3 font-medium">Actor</th>
              <th scope="col" className="px-4 py-3 font-medium">Action</th>
              <th scope="col" className="px-4 py-3 font-medium">Entity</th>
              <th scope="col" className="px-4 py-3 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => onSelect(item)}
              >
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {timeAgo(item.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <p className="font-medium text-foreground">{item.actorName}</p>
                  <p className="text-xs text-muted-foreground">{item.actorRole}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                  {formatAuditAction(item.action)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatAuditEntity(item.entityType)}
                </td>
                <td className="min-w-[200px] max-w-[380px] px-4 py-3 text-muted-foreground">
                  {item.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AuditLogsCards({ items, isPending, isError, onRetry, onSelect }: AuditLogsViewProps) {
  if (isPending) return <AuditLogsSkeleton table={false} />
  if (isError) return <ErrorState text="Could not load the audit trail." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full flex-col gap-2 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {formatAuditAction(item.action)} · {formatAuditEntity(item.entityType)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {timeAgo(item.createdAt)}
              </span>
            </span>
            <span className="block text-sm text-muted-foreground">{item.summary}</span>
            <span className="block text-xs text-muted-foreground">
              {item.actorName} · {item.actorRole}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium text-foreground">No audit records found</p>
      <p className="text-sm text-muted-foreground">Try adjusting the filters or search.</p>
    </div>
  )
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
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

function AuditLogsSkeleton({ table }: { table: boolean }) {
  return (
    <div
      className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${table ? "hidden md:block" : "md:hidden"}`}
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
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