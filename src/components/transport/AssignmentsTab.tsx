import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { AssignmentFormDialog } from "@/components/transport/AssignmentFormDialog"
import { EmptyState, ListSkeleton } from "@/components/transport/transportBits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTransportAssignmentContext, useTransportAssignments, useUpdateTransportAssignment } from "@/hooks/useTransport"
import {
  TRANSPORT_ASSIGNMENT_STATUS_LABELS,
  TRANSPORT_ASSIGNMENT_STATUS_OPTIONS,
  TRANSPORT_DIRECTION_LABELS,
  TRANSPORT_DIRECTION_OPTIONS,
} from "@/types/transport"
import type { TransportAssignmentListItem, TransportAssignmentStatus, TransportDirection } from "@/types/transport"

const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 20

export function AssignmentsTab() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [routeId, setRouteId] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [direction, setDirection] = useState<TransportDirection | "">("")
  const [status, setStatus] = useState<TransportAssignmentStatus | "">("ACTIVE")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)

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

  const { data: context } = useTransportAssignmentContext("")
  const { data, isPending, isError, refetch } = useTransportAssignments({
    search: search || undefined,
    routeId: routeId || undefined,
    academicSessionId: sessionId || undefined,
    direction: direction || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const items = data?.items ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1)
  const sessions = context?.sessions ?? []
  const routes = context?.routes ?? []

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
            placeholder="Search student or admission number…"
            aria-label="Search assignments"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={() => setFormOpen(true)} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            Assign Student
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sessionId} onValueChange={(value) => { setSessionId(value === "all" ? "" : value); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-auto" aria-label="Filter by session">
            <SelectValue placeholder="All sessions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sessions</SelectItem>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={routeId} onValueChange={(value) => { setRouteId(value === "all" ? "" : value); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-auto" aria-label="Filter by route">
            <SelectValue placeholder="All routes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All routes</SelectItem>
            {routes.map((route) => (
              <SelectItem key={route.id} value={route.id}>
                {route.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={(value) => { setDirection(value === "all" ? "" : (value as TransportDirection)); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-auto" aria-label="Filter by direction">
            <SelectValue placeholder="All directions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            {TRANSPORT_DIRECTION_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {TRANSPORT_DIRECTION_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => { setStatus(value === "all" ? "" : (value as TransportAssignmentStatus)); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-auto" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TRANSPORT_ASSIGNMENT_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {TRANSPORT_ASSIGNMENT_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!canView ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          You do not have permission to view transport assignments.
        </p>
      ) : (
        <AssignmentsList
          items={items}
          isPending={isPending}
          isError={isError}
          canUpdate={canUpdate}
          onRetry={() => void refetch()}
        />
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} assignment{total !== 1 ? "s" : ""}
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

      <AssignmentFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}

function AssignmentsList({
  items,
  isPending,
  isError,
  canUpdate,
  onRetry,
}: {
  items: TransportAssignmentListItem[]
  isPending: boolean
  isError: boolean
  canUpdate: boolean
  onRetry: () => void
}) {
  if (isPending) return <ListSkeleton />

  if (isError) {
    return (
      <EmptyState message="Could not load assignments." actionLabel="Try again" onAction={onRetry} />
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="No assignments found"
        hint="Assign a student to a route to start managing transport seats."
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
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Session</th>
                <th scope="col" className="px-4 py-3 font-medium">Route</th>
                <th scope="col" className="px-4 py-3 font-medium">Stop</th>
                <th scope="col" className="px-4 py-3 font-medium">Direction</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((assignment) => (
                <tr key={assignment.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{assignment.studentName}</span>
                    <p className="text-xs text-muted-foreground">{assignment.admissionNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{assignment.sessionName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {assignment.routeName}
                    {assignment.vehicleRegistration && (
                      <p className="text-xs">{assignment.vehicleRegistration}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{assignment.stopName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TRANSPORT_DIRECTION_LABELS[assignment.direction]}
                  </td>
                  <td className="px-4 py-3">
                    <AssignmentStatusBadge status={assignment.status} />
                  </td>
                  <td className="px-4 py-3">
                    {canUpdate && <ToggleStatusButton assignment={assignment} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((assignment) => (
          <li key={assignment.id}>
            <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {assignment.studentName}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {assignment.admissionNumber} · {assignment.sessionName}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {assignment.routeName} · {assignment.stopName} ·{" "}
                  {TRANSPORT_DIRECTION_LABELS[assignment.direction]}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2">
                <AssignmentStatusBadge status={assignment.status} />
                {canUpdate && <ToggleStatusButton assignment={assignment} />}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function AssignmentStatusBadge({ status }: { status: TransportAssignmentStatus }) {
  return status === "ACTIVE" ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Inactive
    </span>
  )
}

function ToggleStatusButton({ assignment }: { assignment: TransportAssignmentListItem }) {
  const updateAssignment = useUpdateTransportAssignment(assignment.id)
  const targetStatus: TransportAssignmentStatus = assignment.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
  const label = assignment.status === "ACTIVE" ? "Deactivate" : "Reactivate"

  return (
    <button
      type="button"
      onClick={() => updateAssignment.mutate({ status: targetStatus })}
      disabled={updateAssignment.isPending}
      className="rounded px-2 py-1 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      {updateAssignment.isPending ? "Saving..." : label}
    </button>
  )
}