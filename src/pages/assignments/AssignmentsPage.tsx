import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { AssignmentsCards, AssignmentsTable } from "@/components/assignments/AssignmentsList"
import { AssignmentsDetailDialog } from "@/components/assignments/AssignmentsDetailDialog"
import { AssignmentsFormDialog } from "@/components/assignments/AssignmentsFormDialog"
import { AssignmentsToolbar } from "@/components/assignments/AssignmentsToolbar"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useAssignmentsList, useDeleteAssignment, usePublishAssignment } from "@/hooks/useAssignments"
import type { AssignmentListItem, AssignmentStatus } from "@/types/assignments"

const SEARCH_DEBOUNCE_MS = 350

export function AssignmentsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const readParam = (key: string) => searchParams.get(key) ?? ""

  const [searchDraft, setSearchDraft] = useState(() => readParam("search"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AssignmentListItem | null>(null)
  const [viewing, setViewing] = useState<AssignmentListItem | null>(null)
  const [deleting, setDeleting] = useState<AssignmentListItem | null>(null)

  const search = readParam("search")
  const status = readParam("status") as AssignmentStatus | ""
  const page = Math.max(1, Number(readParam("page")) || 1)
  const pageSize = Math.max(1, Number(readParam("pageSize")) || 10)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== search) {
        const next = new URLSearchParams(searchParamsRef.current)
        if (searchDraft) next.set("search", searchDraft)
        else next.delete("search")
        next.delete("page")
        setSearchParams(next, { replace: true })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, search, setSearchParams])

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParamsRef.current)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    setSearchParams(next, { replace: true })
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    next.set("page", String(nextPage))
    setSearchParams(next, { replace: true })
  }

  const { data, isPending, isError, refetch } = useAssignmentsList({
    search: search || undefined,
    status: status || undefined,
    page,
    pageSize,
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const canCreate = can("assignments:create")
  const canEdit = can("assignments:update")
  const canDelete = can("assignments:delete")
  const canPublish = can("assignments:update")

  const publishMutation = usePublishAssignment()
  const deleteMutation = useDeleteAssignment()

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Assignments"
          description="Create and manage assignment work per class, subject, and teacher."
        />
        <AssignmentsToolbar
          search={searchDraft}
          status={status}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onStatusChange={(value) => updateFilter("status", value)}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />
        <AssignmentsTable
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canPublish}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onView={setViewing}
          onEdit={(assignment) => {
            setEditing(assignment)
            setDialogOpen(true)
          }}
          onPublish={(assignment) => publishMutation.mutate(assignment.id)}
          onDelete={setDeleting}
        />
        <AssignmentsCards
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canPublish}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onView={setViewing}
          onEdit={(assignment) => {
            setEditing(assignment)
            setDialogOpen(true)
          }}
          onPublish={(assignment) => publishMutation.mutate(assignment.id)}
          onDelete={setDeleting}
        />

        {items.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {total} item{total !== 1 ? "s" : ""}
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

        <AssignmentsFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
        <AssignmentsDetailDialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }} assignment={viewing} />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => { if (!open) setDeleting(null) }}
          title="Delete assignment?"
          description={`This will permanently delete "${deleting?.title ?? ""}". Only drafts can be deleted.`}
          confirmLabel="Delete assignment"
          isPending={deleteMutation.isPending}
          onConfirm={() => {
            if (deleting) {
              deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
            }
          }}
        />
      </div>
    </PageContainer>
  )
}