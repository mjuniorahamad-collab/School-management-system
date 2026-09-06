import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { VehicleFormDialog } from "@/components/transport/VehicleFormDialog"
import { ActiveBadge, EmptyState, ListSkeleton, SeatsText } from "@/components/transport/transportBits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTransportVehicles } from "@/hooks/useTransport"
import { TRANSPORT_VEHICLE_TYPE_LABELS, TRANSPORT_VEHICLE_TYPE_OPTIONS } from "@/types/transport"
import type { TransportVehicleListItem, TransportVehicleType } from "@/types/transport"

const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 20

export function VehiclesTab() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [type, setType] = useState<TransportVehicleType | "">("")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TransportVehicleListItem | null>(null)

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

  const { data, isPending, isError, refetch } = useTransportVehicles({
    search: search || undefined,
    type: type || undefined,
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
            placeholder="Search registration or code…"
            aria-label="Search vehicles"
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
            New Vehicle
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value === "all" ? "" : (value as TransportVehicleType))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-auto" aria-label="Filter by vehicle type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TRANSPORT_VEHICLE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {TRANSPORT_VEHICLE_TYPE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Capacity counts seats per trip — TO_SCHOOL uses the morning trip, FROM_SCHOOL the
          afternoon trip, BOTH one seat on each.
        </p>
      </div>

      {!canView ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          You do not have permission to view transport vehicles.
        </p>
      ) : (
        <VehiclesList
          items={items}
          isPending={isPending}
          isError={isError}
          canUpdate={canUpdate}
          onRetry={() => void refetch()}
          onEdit={(vehicle) => {
            setEditing(vehicle)
            setFormOpen(true)
          }}
        />
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} vehicle{total !== 1 ? "s" : ""}
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

      <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </div>
  )
}

function VehiclesList({
  items,
  isPending,
  isError,
  canUpdate,
  onRetry,
  onEdit,
}: {
  items: TransportVehicleListItem[]
  isPending: boolean
  isError: boolean
  canUpdate: boolean
  onRetry: () => void
  onEdit: (vehicle: TransportVehicleListItem) => void
}) {
  if (isPending) return <ListSkeleton />

  if (isError) {
    return <EmptyState message="Could not load vehicles." actionLabel="Try again" onAction={onRetry} />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="No vehicles found"
        hint="Add a vehicle so routes and capacity can be managed."
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
                <th scope="col" className="px-4 py-3 font-medium">Vehicle</th>
                <th scope="col" className="px-4 py-3 font-medium">Registration</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Capacity</th>
                <th scope="col" className="px-4 py-3 font-medium">Route</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((vehicle) => (
                <tr key={vehicle.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{vehicle.vehicleCode}</span>
                    {vehicle.make && (
                      <p className="text-xs text-muted-foreground">
                        {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                        {vehicle.year ? ` · ${vehicle.year}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{vehicle.registrationNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TRANSPORT_VEHICLE_TYPE_LABELS[vehicle.type]}
                  </td>
                  <td className="px-4 py-3">
                    <SeatsText seatsUsed={vehicle.seatsUsed} capacity={vehicle.capacity} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{vehicle.routeName ?? "Unassigned"}</td>
                  <td className="px-4 py-3">
                    <ActiveBadge isActive={vehicle.isActive} />
                  </td>
                  <td className="px-4 py-3">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => onEdit(vehicle)}
                        aria-label={`Edit ${vehicle.vehicleCode}`}
                        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((vehicle) => (
          <li key={vehicle.id}>
            <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {vehicle.vehicleCode} · {vehicle.registrationNumber}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {TRANSPORT_VEHICLE_TYPE_LABELS[vehicle.type]}
                  {vehicle.routeName ? ` · ${vehicle.routeName}` : " · Unassigned"}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  <SeatsText seatsUsed={vehicle.seatsUsed} capacity={vehicle.capacity} />
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2">
                <ActiveBadge isActive={vehicle.isActive} />
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => onEdit(vehicle)}
                    aria-label={`Edit ${vehicle.vehicleCode}`}
                    className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Edit
                  </button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}