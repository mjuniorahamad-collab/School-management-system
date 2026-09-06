import { useState } from "react"
import { ArrowDown, ArrowUp, Pencil, Plus, Power } from "lucide-react"
import { StopFormDialog } from "@/components/transport/StopFormDialog"
import { EmptyState, SeatsText } from "@/components/transport/transportBits"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useTransportRoute, useUpdateTransportStop } from "@/hooks/useTransport"
import type { TransportRouteListItem, TransportStopDetail } from "@/types/transport"

export function StopsManagerDialog({
  route,
  open,
  onOpenChange,
}: {
  route: TransportRouteListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: detail, isPending, isError, refetch } = useTransportRoute(route?.id ?? null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<{ stop: TransportStopDetail } | null>(null)

  const content = (() => {
    if (isPending) {
      return (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      )
    }
    if (isError || !detail) {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Could not load this route.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Try again
          </button>
        </div>
      )
    }
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            Vehicle:{" "}
            <span className="font-medium text-foreground">
              {detail.vehicleRegistration ?? "None assigned"}
            </span>
          </span>
          {detail.vehicleCapacity !== null && (
            <span>
              Seats: <SeatsText seatsUsed={detail.seatsUsed} capacity={detail.vehicleCapacity} />
            </span>
          )}
        </div>

        {detail.stops.length === 0 ? (
          <EmptyState message="No stops yet" hint="Add the first stop for this route." />
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.stops.map((stop, index) => (
              <li
                key={stop.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <span className="w-8 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${stop.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
                    {stop.name}
                  </span>
                  {!stop.isActive && (
                    <span className="text-xs text-muted-foreground">Inactive stop</span>
                  )}
                </span>
                <StopActions
                  index={index}
                  count={detail.stops.length}
                  stop={stop}
                  onRename={() => {
                    setEditing({ stop })
                    setFormOpen(true)
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add Stop
          </Button>
        </div>

        <StopFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          routeId={route?.id ?? null}
          editingName={editing?.stop.name}
          stopId={editing?.stop.id}
        />
      </>
    )
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{route?.name ?? "Route"}</DialogTitle>
          <DialogDescription>Manage stops and their order for this route.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">{content}</div>
      </DialogContent>
    </Dialog>
  )
}

function StopActions({
  index,
  count,
  stop,
  onRename,
}: {
  index: number
  count: number
  stop: TransportStopDetail
  onRename: () => void
}) {
  const updateStop = useUpdateTransportStop(stop.routeId, stop.id)

  const move = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= count) return
    updateStop.mutate({ sortOrder: targetIndex })
  }

  const toggle = () => updateStop.mutate({ isActive: !stop.isActive })

  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => move(index - 1)}
        disabled={index === 0 || updateStop.isPending}
        aria-label={`Move ${stop.name} up`}
        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => move(index + 1)}
        disabled={index === count - 1 || updateStop.isPending}
        aria-label={`Move ${stop.name} down`}
        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onRename}
        aria-label={`Rename ${stop.name}`}
        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={updateStop.isPending}
        aria-label={stop.isActive ? `Deactivate ${stop.name}` : `Activate ${stop.name}`}
        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Power className="size-4" aria-hidden="true" />
      </button>
    </span>
  )
}