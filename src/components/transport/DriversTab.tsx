import { useCallback, useEffect, useRef, useState } from "react"
import { Pencil, Plus, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { DriverFormDialog } from "@/components/transport/DriverFormDialog"
import { ActiveBadge, EmptyState, ListSkeleton } from "@/components/transport/transportBits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTransportDrivers } from "@/hooks/useTransport"
import type { TransportDriverListItem } from "@/types/transport"

const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 20

export function DriversTab() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TransportDriverListItem | null>(null)

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

  const { data, isPending, isError, refetch } = useTransportDrivers({
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
            placeholder="Search staff or employee ID…"
            aria-label="Search drivers"
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
            Add Driver
          </Button>
        )}
      </div>

      {!canView ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          You do not have permission to view transport drivers.
        </p>
      ) : (
        <DriversList
          items={items}
          isPending={isPending}
          isError={isError}
          canUpdate={canUpdate}
          onRetry={() => void refetch()}
          onEdit={(driver) => {
            setEditing(driver)
            setFormOpen(true)
          }}
        />
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} driver{total !== 1 ? "s" : ""}
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

      <DriverFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </div>
  )
}

function DriversList({
  items,
  isPending,
  isError,
  canUpdate,
  onRetry,
  onEdit,
}: {
  items: TransportDriverListItem[]
  isPending: boolean
  isError: boolean
  canUpdate: boolean
  onRetry: () => void
  onEdit: (driver: TransportDriverListItem) => void
}) {
  if (isPending) return <ListSkeleton />

  if (isError) {
    return <EmptyState message="Could not load drivers." actionLabel="Try again" onAction={onRetry} />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="No drivers found"
        hint="Link a staff member as a driver to manage transport staffing."
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
                <th scope="col" className="px-4 py-3 font-medium">Driver</th>
                <th scope="col" className="px-4 py-3 font-medium">Employee</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Route</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((driver) => (
                <tr key={driver.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">
                      {driver.staffName}
                      {driver.userId && (
                        <span className="ml-2 text-xs text-muted-foreground">has login</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{driver.employeeId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{driver.roleLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground">{driver.routeName ?? "Not assigned"}</td>
                  <td className="px-4 py-3">
                    <ActiveBadge isActive={driver.isActive} />
                  </td>
                  <td className="px-4 py-3">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => onEdit(driver)}
                        aria-label={`Edit ${driver.staffName}`}
                        className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
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
        {items.map((driver) => (
          <li key={driver.id}>
            <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {driver.staffName}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {driver.employeeId} · {driver.roleLabel}
                  {driver.userId ? " · has login" : ""}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {driver.routeName ?? "Not assigned to a route"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2">
                <ActiveBadge isActive={driver.isActive} />
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => onEdit(driver)}
                    aria-label={`Edit ${driver.staffName}`}
                    className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
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