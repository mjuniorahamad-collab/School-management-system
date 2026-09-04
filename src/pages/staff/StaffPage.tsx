import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { StaffFormDialog } from "@/components/staff/StaffFormDialog"
import { StaffTable, StaffCards } from "@/components/staff/StaffList"
import { StaffToolbar } from "@/components/staff/StaffToolbar"
import { useStaffs } from "@/hooks/useStaff"
import type { StaffListItem } from "@/types/staff"

const SEARCH_DEBOUNCE_MS = 350

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function StaffPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))
  const [statusDraft, setStatusDraft] = useState(() => readParam(searchParams, "status"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StaffListItem | null>(null)

  const search = readParam(searchParams, "search")
  const status = readParam(searchParams, "status")
  const page = Math.max(1, Number(readParam(searchParams, "page")) || 1)
  const pageSize = Math.max(1, Number(readParam(searchParams, "pageSize")) || 25)

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParamsRef.current)
      if (searchDraft) next.set("search", searchDraft)
      else next.delete("search")
      if (statusDraft) next.set("status", statusDraft)
      else next.delete("status")
      next.delete("page")
      setSearchParams(next, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, statusDraft, setSearchParams])

  const query = { search: search || undefined, status: status || undefined, page, pageSize }
  const { data, isPending, isError, refetch } = useStaffs(query)
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    next.set("page", String(nextPage))
    setSearchParams(next, { replace: true })
  }

  const canCreate = can("staff:create")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Staff"
          description="Manage non-teaching staff, departments, and employment records."
          actions={
            canCreate ? (
              <button
                type="button"
                onClick={() => { setEditing(null); setDialogOpen(true) }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Add Staff Member
              </button>
            ) : undefined
          }
        />

        <StaffToolbar
          search={searchDraft}
          status={statusDraft}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onStatusChange={setStatusDraft}
          onCreateClick={() => { setEditing(null); setDialogOpen(true) }}
        />

        <StaffTable
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={can("staff:update")}
          onRetry={() => void refetch()}
          onEdit={(staff) => { setEditing(staff); setDialogOpen(true) }}
        />
        <StaffCards
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={can("staff:update")}
          onRetry={() => void refetch()}
          onEdit={(staff) => { setEditing(staff); setDialogOpen(true) }}
        />

        {items.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {total} staff member{total !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                ← Prev
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                onClick={() => goToPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <StaffFormDialog open={dialogOpen} onOpenChange={setDialogOpen} staff={editing} />
      </div>
    </PageContainer>
  )
}
