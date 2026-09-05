import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Pencil, Search } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { FeeStructureFormDialog } from "@/components/fees/FeeStructureFormDialog"
import { FeeClassSelect } from "@/components/shared/FeeClassSelect"
import { FeeSessionSelect } from "@/components/shared/FeeSessionSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useFeeStructures } from "@/hooks/useFeeStructures"
import { formatFullDate, formatINR } from "@/lib/format"
import type { FeeStructureListResult } from "@/types/fees"

const SEARCH_DEBOUNCE_MS = 350

export function FeeStructuresTab() {
  const { can } = useAuth()
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [classId, setClassId] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const searchRef = useRef("")
  useEffect(() => {
    searchRef.current = search
  }, [search])

  const commitSearch = useCallback((draft: string) => setSearch(draft), [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== searchRef.current) commitSearch(searchDraft)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, commitSearch])

  const { data, isPending, isError, refetch } = useFeeStructures({
    search: search || undefined,
    sessionId: sessionId || undefined,
    classId: classId || undefined,
    pageSize: 50,
  })

  const canCreate = can("fees:create")
  const canUpdate = can("fees:update")

  const editing = editingId ? (data?.items.find((item) => item.id === editingId) ?? null) : null

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
            placeholder="Search structure name…"
            aria-label="Search fee structures"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setEditingId(null)
              setDialogOpen(true)
            }}
            className="shrink-0"
          >
            <Plus className="size-4" aria-hidden="true" />
            New Structure
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FeeSessionSelect value={sessionId} onValueChange={(value) => setSessionId(value === "all" ? "" : (value ?? ""))} />
        <FeeClassSelect value={classId} onValueChange={(value) => setClassId(value === "all" ? "" : (value ?? ""))} />
      </div>

      <StructuresList
        data={data}
        isPending={isPending}
        isError={isError}
        canUpdate={canUpdate}
        onRetry={() => void refetch()}
        onEdit={(id) => {
          setEditingId(id)
          setDialogOpen(true)
        }}
      />

      <FeeStructureFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  )
}

function StructuresList({
  data,
  isPending,
  isError,
  canUpdate,
  onRetry,
  onEdit,
}: {
  data: FeeStructureListResult | undefined
  isPending: boolean
  isError: boolean
  canUpdate: boolean
  onRetry: () => void
  onEdit: (id: string) => void
}) {
  if (isPending) return <StructuresSkeleton />

  if (isError) {
    return (
      <EmptyState
        message="Could not load fee structures."
        actionLabel="Try again"
        onAction={onRetry}
      />
    )
  }

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <EmptyState
        message="No fee structures found"
        hint="Create a structure for a class and academic session before generating invoices."
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
                <th scope="col" className="px-4 py-3 font-medium">Structure</th>
                <th scope="col" className="px-4 py-3 font-medium">Session</th>
                <th scope="col" className="px-4 py-3 font-medium">Class</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-4 py-3 font-medium">Items</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Updated</th>
                {canUpdate && <th scope="col" className="w-10 px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{item.name}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.session.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.class.name}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">
                    {formatINR(item.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{item.itemCount}</td>
                  <td className="px-4 py-3">
                    <StructureActiveBadge isActive={item.isActive} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatFullDate(item.updatedAt)}
                  </td>
                  {canUpdate && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onEdit(item.id)}
                        aria-label={`Edit ${item.name}`}
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

      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                  <StructureActiveBadge isActive={item.isActive} />
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {item.session.name} · {item.class.name}
                </span>
                <span className="mt-1 block text-sm font-medium text-foreground tabular-nums">
                  {formatINR(item.totalAmount)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    · {item.itemCount} items
                  </span>
                </span>
              </span>
              {canUpdate && (
                <button
                  type="button"
                  onClick={() => onEdit(item.id)}
                  aria-label={`Edit ${item.name}`}
                  className="inline-flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function StructureActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Inactive
    </span>
  )
}

function EmptyState({
  message,
  hint,
  actionLabel,
  onAction,
}: {
  message: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function StructuresSkeleton() {
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