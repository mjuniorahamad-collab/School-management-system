import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { ConcessionOverrideDialog } from "@/components/concessions/ConcessionOverrideDialog"
import { ConcessionRequestDialog } from "@/components/concessions/ConcessionRequestDialog"
import { ConcessionStatusBadge, ConcessionValueLabel } from "@/components/concessions/ConcessionStatusBadge"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useApproveConcession,
  useCancelConcession,
  useConcessions,
  useRejectConcession,
  useReverseConcession,
} from "@/hooks/useConcessions"
import { formatFullDate, formatINR } from "@/lib/format"
import { ADJUSTMENT_KINDS, ADJUSTMENT_STATUSES } from "@/types/concessions"
import type {
  AdjustmentKind,
  AdjustmentListItem,
  AdjustmentListResult,
  AdjustmentQuery,
  AdjustmentStatus,
} from "@/types/concessions"

const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 20

type ConfirmType = "approve" | "reject" | "cancel" | "reverse"

interface ConfirmAction {
  type: ConfirmType
  item: AdjustmentListItem
}

const CONFIRM_COPY: Record<ConfirmType, { title: string; description: string; label: string }> = {
  approve: {
    title: "Approve concession",
    description:
      "This immediately applies the concession to the invoice and reduces the student's outstanding installments.",
    label: "Approve",
  },
  reject: {
    title: "Reject concession",
    description: "The request will be closed and no money will change on the invoice.",
    label: "Reject request",
  },
  cancel: {
    title: "Cancel request",
    description: "Withdraw this concession request. It cannot be approved after cancellation.",
    label: "Cancel request",
  },
  reverse: {
    title: "Reverse concession",
    description:
      "Undo this approved concession and restore the original invoice schedule. Paid amounts are never affected.",
    label: "Reverse concession",
  },
}

export function ConcessionsPage() {
  const { user, can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>("")
  const [kind, setKind] = useState<string>("")
  const [page, setPage] = useState(1)
  const [requestOpen, setRequestOpen] = useState(false)
  const [overrideItem, setOverrideItem] = useState<AdjustmentListItem | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

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

  const canView = can("concessions:view")
  const canRequest = can("concessions:request")
  const canApprove = can("concessions:approve")
  const canReject = can("concessions:reject")
  const canOverride = can("concessions:override")
  const canReverse = can("concessions:reverse")

  const query: AdjustmentQuery = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: (status as AdjustmentStatus) || undefined,
    kind: (kind as AdjustmentKind) || undefined,
  }
  const { data, isPending, isError, refetch } = useConcessions(query)

  const approveMutation = useApproveConcession()
  const rejectMutation = useRejectConcession()
  const cancelMutation = useCancelConcession()
  const reverseMutation = useReverseConcession()
  const confirmPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending ||
    reverseMutation.isPending

  const updateFilter = (nextPage = 1) => setPage(nextPage)

  const runConfirm = () => {
    if (!confirmAction) return
    const close = () => setConfirmAction(null)
    switch (confirmAction.type) {
      case "approve":
        approveMutation.mutate(confirmAction.item.id, { onSuccess: close })
        break
      case "reject":
        rejectMutation.mutate({ id: confirmAction.item.id, payload: {} }, { onSuccess: close })
        break
      case "cancel":
        cancelMutation.mutate(confirmAction.item.id, { onSuccess: close })
        break
      case "reverse":
        reverseMutation.mutate(confirmAction.item.id, { onSuccess: close })
        break
    }
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Fee Concessions"
          description="Request, approve, and reverse fee concessions against student invoices. Approving applies the concession to the earliest unpaid installments."
        />

        {!canView ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view fee concessions.
          </p>
        ) : (
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
                  placeholder="Search student, invoice, reason…"
                  aria-label="Search concessions"
                  className="pl-9"
                />
              </div>
              {canRequest && (
                <Button onClick={() => setRequestOpen(true)} className="shrink-0">
                  <Plus className="size-4" aria-hidden="true" />
                  Request Concession
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value === "all" ? "" : value)
                  updateFilter()
                }}
              >
                <SelectTrigger className="w-full sm:w-44" aria-label="Status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {ADJUSTMENT_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value === "all" ? "" : value)
                  updateFilter()
                }}
              >
                <SelectTrigger className="w-full sm:w-40" aria-label="Type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {ADJUSTMENT_KINDS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "FIXED_AMOUNT" ? "Fixed amount" : "Percentage"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ConcessionsList
              data={data}
              isPending={isPending}
              isError={isError}
              onRetry={() => void refetch()}
              canApprove={canApprove}
              canReject={canReject}
              canOverride={canOverride}
              canReverse={canReverse}
              canCancel={canRequest}
              currentUserId={user?.id ?? null}
              onApprove={(item) => setConfirmAction({ type: "approve", item })}
              onReject={(item) => setConfirmAction({ type: "reject", item })}
              onCancel={(item) => setConfirmAction({ type: "cancel", item })}
              onReverse={(item) => setConfirmAction({ type: "reverse", item })}
              onOverride={setOverrideItem}
            />

            {data && !isPending && data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {data.pagination.total} concession{data.pagination.total === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    Page {page} of {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <ConcessionRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
        <ConcessionOverrideDialog
          open={Boolean(overrideItem)}
          onOpenChange={(open) => {
            if (!open) setOverrideItem(null)
          }}
          item={overrideItem}
        />
        <ConfirmDialog
          open={Boolean(confirmAction)}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null)
          }}
          title={confirmAction ? CONFIRM_COPY[confirmAction.type].title : ""}
          description={confirmAction ? CONFIRM_COPY[confirmAction.type].description : ""}
          confirmLabel={confirmAction ? CONFIRM_COPY[confirmAction.type].label : ""}
          isPending={confirmPending}
          onConfirm={runConfirm}
        />
      </div>
    </PageContainer>
  )
}

function ConcessionsList({
  data,
  isPending,
  isError,
  onRetry,
  canApprove,
  canReject,
  canOverride,
  canReverse,
  canCancel,
  currentUserId,
  onApprove,
  onReject,
  onCancel,
  onReverse,
  onOverride,
}: {
  data: AdjustmentListResult | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  canApprove: boolean
  canReject: boolean
  canOverride: boolean
  canReverse: boolean
  canCancel: boolean
  currentUserId: string | null
  onApprove: (item: AdjustmentListItem) => void
  onReject: (item: AdjustmentListItem) => void
  onCancel: (item: AdjustmentListItem) => void
  onReverse: (item: AdjustmentListItem) => void
  onOverride: (item: AdjustmentListItem) => void
}) {
  if (isPending) return <ConcessionsSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load concessions.</p>
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

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">No concessions found</p>
        <p className="text-sm text-muted-foreground">
          Request a concession against a student's invoice to get started.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Requested</th>
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Value</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Applies</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Reason</th>
                <th scope="col" className="px-4 py-3 font-medium">Requested by</th>
                <th scope="col" className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <ConcessionRow
                  key={item.id}
                  item={item}
                  canApprove={canApprove}
                  canReject={canReject}
                  canOverride={canOverride}
                  canReverse={canReverse}
                  canCancel={canCancel}
                  currentUserId={currentUserId}
                  onApprove={() => onApprove(item)}
                  onReject={() => onReject(item)}
                  onCancel={() => onCancel(item)}
                  onReverse={() => onReverse(item)}
                  onOverride={() => onOverride(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <MobileConcessionCard
            key={item.id}
            item={item}
            canApprove={canApprove}
            canReject={canReject}
            canOverride={canOverride}
            canReverse={canReverse}
            canCancel={canCancel}
            currentUserId={currentUserId}
            onApprove={() => onApprove(item)}
            onReject={() => onReject(item)}
            onCancel={() => onCancel(item)}
            onReverse={() => onReverse(item)}
            onOverride={() => onOverride(item)}
          />
        ))}
      </ul>
    </>
  )
}

interface ConcessionActions {
  approve: boolean
  reject: boolean
  cancel: boolean
  override: boolean
  reverse: boolean
}

function availableActions(
  item: AdjustmentListItem,
  flags: { canApprove: boolean; canReject: boolean; canCancel: boolean; canOverride: boolean; canReverse: boolean },
  currentUserId: string | null,
): ConcessionActions {
  const isOwn = Boolean(item.requestedBy && item.requestedBy.id === currentUserId)
  return {
    approve: item.status === "REQUESTED" && flags.canApprove && !isOwn,
    reject: item.status === "REQUESTED" && flags.canReject,
    cancel: item.status === "REQUESTED" && flags.canCancel && isOwn,
    override: item.status === "REQUESTED" && flags.canOverride && !isOwn,
    reverse: item.status === "APPROVED" && flags.canReverse,
  }
}

function ActionsCell({ actions, onRun }: { actions: ConcessionActions; onRun: { [K in keyof ConcessionActions]: () => void } }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.override && (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200" onClick={onRun.override}>
          Override
        </Button>
      )}
      {actions.approve && (
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onRun.approve}>
          Approve
        </Button>
      )}
      {actions.reject && (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={onRun.reject}>
          Reject
        </Button>
      )}
      {actions.cancel && (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={onRun.cancel}>
          Cancel
        </Button>
      )}
      {actions.reverse && (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200" onClick={onRun.reverse}>
          Reverse
        </Button>
      )}
    </div>
  )
}

function ConcessionRow({
  item,
  canApprove,
  canReject,
  canOverride,
  canReverse,
  canCancel,
  currentUserId,
  onApprove,
  onReject,
  onCancel,
  onReverse,
  onOverride,
}: RowProps) {
  const actions = availableActions(
    item,
    { canApprove, canReject, canCancel, canOverride, canReverse },
    currentUserId,
  )
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatFullDate(item.createdAt)}</td>
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">{item.invoice.student.fullName}</p>
        <p className="text-xs text-muted-foreground">{item.invoice.student.admissionNumber}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.invoice.invoiceNumber}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {item.kind === "FIXED_AMOUNT" ? "Fixed" : "Percentage"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        <ConcessionValueLabel kind={item.kind} value={item.value} />
      </td>
      <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">
        {formatINR(item.computedAmount)}
      </td>
      <td className="px-4 py-3">
        <ConcessionStatusBadge status={item.status} />
        {item.overridden && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Overridden</p>}
      </td>
      <td className="max-w-48 px-4 py-3">
        <p className="truncate text-xs text-muted-foreground" title={item.reason ?? undefined}>
          {item.reason ?? "—"}
        </p>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{item.requestedBy?.name ?? "—"}</td>
      <td className="px-4 py-3">
        <ActionsCell
          actions={actions}
          onRun={{ approve: onApprove, reject: onReject, cancel: onCancel, override: onOverride, reverse: onReverse }}
        />
      </td>
    </tr>
  )
}

function MobileConcessionCard({
  item,
  canApprove,
  canReject,
  canOverride,
  canReverse,
  canCancel,
  currentUserId,
  onApprove,
  onReject,
  onCancel,
  onReverse,
  onOverride,
}: RowProps) {
  const actions = availableActions(
    item,
    { canApprove, canReject, canCancel, canOverride, canReverse },
    currentUserId,
  )
  return (
    <li className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{item.invoice.student.fullName}</span>
        <ConcessionStatusBadge status={item.status} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {item.invoice.invoiceNumber} · {formatFullDate(item.createdAt)}
      </p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {item.kind === "FIXED_AMOUNT" ? "Fixed" : "Percentage"} ·{" "}
          <span className="text-foreground">
            {item.kind === "PERCENTAGE" ? `${item.value}%` : formatINR(item.value)}
          </span>
        </span>
        <span className="font-medium text-foreground tabular-nums">{formatINR(item.computedAmount)}</span>
      </div>
      {item.reason && <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>}
      <div className="mt-3">
        <ActionsCell
          actions={actions}
          onRun={{ approve: onApprove, reject: onReject, cancel: onCancel, override: onOverride, reverse: onReverse }}
        />
      </div>
    </li>
  )
}

interface RowProps {
  item: AdjustmentListItem
  canApprove: boolean
  canReject: boolean
  canOverride: boolean
  canReverse: boolean
  canCancel: boolean
  currentUserId: string | null
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  onReverse: () => void
  onOverride: () => void
}

function ConcessionsSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
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

