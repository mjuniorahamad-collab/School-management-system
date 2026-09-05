import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuditLog } from "@/hooks/useAuditLogs"
import { formatFullDate } from "@/lib/format"
import { formatAuditAction, formatAuditEntity, type AuditLogDiffField } from "@/types/auditLogs"

interface AuditLogDetailDialogProps {
  logId: string | null
  onOpenChange: (open: boolean) => void
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function DiffTable({ fields }: { fields: AuditLogDiffField[] }) {
  if (fields.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
      <table className="w-full text-left text-xs">
        <thead className="border-b bg-muted/40 font-medium text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Field</th>
            <th scope="col" className="px-3 py-2 font-medium">Before</th>
            <th scope="col" className="px-3 py-2 font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((field) => (
            <tr key={field.field}>
              <td className="px-3 py-2 font-medium text-foreground">{field.field}</td>
              <td className="px-3 py-2 text-muted-foreground">{renderValue(field.before)}</td>
              <td className="px-3 py-2 text-muted-foreground">{renderValue(field.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AuditLogDetailDialog({ logId, onOpenChange }: AuditLogDetailDialogProps) {
  const { data, isPending, isError, refetch } = useAuditLog(logId)

  return (
    <Dialog open={logId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Audit record</DialogTitle>
          <DialogDescription>Immutable trail entry captured when the action was performed.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Could not load the audit record.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {formatAuditAction(data.action)}{" "}
                  <span className="font-normal text-muted-foreground">
                    {formatAuditEntity(data.entityType)}
                  </span>
                </p>
                <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatFullDate(data.createdAt)}
                </p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{data.summary}</p>
              <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                <p>
                  Actor: <span className="font-medium text-foreground">{data.actorName}</span>
                  {data.actorEmail ? ` (${data.actorEmail})` : ""}
                </p>
                <p>
                  Role: <span className="font-medium text-foreground">{data.actorRole}</span>
                </p>
                {data.entityId && (
                  <p>
                    Entity ID: <span className="font-medium text-foreground">{data.entityId}</span>
                  </p>
                )}
              </div>
            </div>

            {data.diff && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">Changes</p>
                <DiffTable fields={data.diff.fields} />
              </div>
            )}

            {data.metadata && Object.keys(data.metadata).length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">Details</p>
                <div className="flex flex-col gap-1 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
                  {Object.entries(data.metadata).map(([key, value]) => (
                    <p key={key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{key}</span>: {renderValue(value)}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {data && (
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}