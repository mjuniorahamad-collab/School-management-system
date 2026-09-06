import { useCallback, useEffect, useRef, useState } from "react"
import { MapPin, Pencil, Plus, Route as RouteIcon, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { RouteFormDialog } from "@/components/transport/RouteFormDialog"
import { StopsManagerDialog } from "@/components/transport/StopsManagerDialog"
import { ActiveBadge, EmptyState, ListSkeleton, SeatsText } from "@/components/transport/transportBits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTransportRoutes } from "@/hooks/useTransport"
import type { TransportRouteListItem } from "@/types/transport"

const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 20

export function RoutesTab() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TransportRouteListItem | null>(null)
  const [managing, setManaging] = useState<TransportRouteListItem | null>(null)

  const searchRef = useRef("")
  useEffect(() => {
    searchRef.current = search
  }, [search])

  const commitSearch = useCallback((draft: string) => {
    setSearch(draft)
    setPage(1)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== searchRef.current) commitSearch(searchDraft)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, commitSearch])

  const { data, isPending, isError, refetch } = useTransportRoutes({
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const items = data?.items ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1)

  const canView = can("transport:view")
  const canCreate = can("transport:create")
  const canUpdate = can("transport:update")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search routes…"
            aria-label="Search routes"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="shrink-0"
          >
            <Plus className="size-4" aria-hidden="true" />
            New Route
          </Button>
        )}
      </div>

      {!canView ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          You do not have permission to view transport routes.
        </p>
      ) : (
        <RoutesList
          items={items}
          isPending={isPending}
          isError={isError}
          canUpdate={canUpdate}
          onRetry={() => void refetch()}
          onManage={setManaging}
          onEdit={(route) => {
            setEditing(route)
            setFormOpen(true)
          }}
        />
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} route{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded px-2 py-1 font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              ← Prev
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded px-2 py-1 font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <RouteFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <StopsManagerDialog
        route={managing ?? null}
        open={Boolean(managing)}
        onOpenChange={(open) => !open && setManaging(null)}
      />
    </div>
  )
}

function RoutesList({
  items,
  isPending,
  isError,
  canUpdate,
  onRetry,
  onManage,
  onEdit,
}: {
  items: TransportRouteListItem[]
  isPending: boolean
  isError: boolean
  canUpdate: boolean
  onRetry: () => void
  onManage: (route: TransportRouteListItem) => void
  onEdit: (route: TransportRouteListItem) => void
}) {
  if (isPending) return <ListSkeleton />

  if (isError) {
    return <EmptyState message="Could not load routes." actionLabel="Try again" onAction={onRetry} />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="No routes found"
        hint="Create a route and attach a vehicle to start assigning students."
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Route</th>
                <th scope="col" className="px-4 py-3 font-medium">Vehicle</th>
                <th scope="col" className="px-4 py-3 font-medium">Seats</th>
                <th scope="col" className="px-4 py-3 font-medium">Stops</th>
                <th scope="col" className="px-4 py-3 font-medium">Drivers</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((route) => (
                <tr key={route.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{route.name}</span>
                    {route.code && <p className="text-xs text-muted-foreground">Code {route.code}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {route.vehicleRegistration ?? "None assigned"}
                  </td>
                  <td className="px-4 py-3">
                    {route.vehicleCapacity !== null ? (
                      <SeatsText seatsUsed={route.seatsUsed} capacity={route.vehicleCapacity} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {route.stopCount} {route.stopCount === 1 ? "stop" : "stops"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {route.driverCount} {route.driverCount === 1 ? "driver" : "drivers"}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge isActive={route.isActive} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onManage(route)}
                        aria-label={`Manage stops for ${route.name}`}
                        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <MapPin className="size-4" aria-hidden="true" />
                      </button>
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => onEdit(route)}
                          aria-label={`Edit ${route.name}`}
                          className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((route) => (
          <li key={route.id}>
            <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <RouteIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate text-sm font-medium text-foreground">{route.name}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {route.vehicleRegistration ?? "No vehicle"} · {route.stopCount} stops ·{" "}
                  {route.driverCount} drivers
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {route.vehicleCapacity !== null ? (
                    <SeatsText seatsUsed={route.seatsUsed} capacity={route.vehicleCapacity} />
                  ) : (
                    "No vehicle capacity"
                  )}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2">
                <ActiveBadge isActive={route.isActive} />
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onManage(route)}
                    aria-label={`Manage stops for ${route.name}`}
                    className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <MapPin className="size-4" aria-hidden="true" />
                  </button>
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => onEdit(route)}
                      aria-label={`Edit ${route.name}`}
                      className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}