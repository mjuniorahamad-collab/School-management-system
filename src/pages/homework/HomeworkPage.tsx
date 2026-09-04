import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { HomeworkDetailDialog } from "@/components/homework/HomeworkDetailDialog"
import { HomeworkFormDialog } from "@/components/homework/HomeworkFormDialog"
import { HomeworkCards, HomeworkTable } from "@/components/homework/HomeworkList"
import { HomeworkToolbar } from "@/components/homework/HomeworkToolbar"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { useDeleteHomework, useHomeworkList, usePublishHomework } from "@/hooks/useHomework"
import type { HomeworkListItem, TaskStatus } from "@/types/homework"

const SEARCH_DEBOUNCE_MS = 350

export function HomeworkPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const readParam = (key: string) => searchParams.get(key) ?? ""

  const [searchDraft, setSearchDraft] = useState(() => readParam("search"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<HomeworkListItem | null>(null)
  const [viewing, setViewing] = useState<HomeworkListItem | null>(null)
  const [deleting, setDeleting] = useState<HomeworkListItem | null>(null)

  const search = readParam("search")
  const status = readParam("status") as TaskStatus | ""
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

  const { data, isPending, isError, refetch } = useHomeworkList({
    search: search || undefined,
    status: status || undefined,
    page,
    pageSize,
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const canCreate = can("homework:create")
  const canEdit = can("homework:update")
  const canDelete = can("homework:delete")
  const canPublish = can("homework:update")

  const publishMutation = usePublishHomework()
  const deleteMutation = useDeleteHomework()

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Homework"
          description="Assign homework per class, subject, and teacher, and track due dates."
        />
        <HomeworkToolbar
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
        <HomeworkTable
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canPublish}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onView={setViewing}
          onEdit={(homework) => {
            setEditing(homework)
            setDialogOpen(true)
          }}
          onPublish={(homework) => publishMutation.mutate(homework.id)}
          onDelete={setDeleting}
        />
        <HomeworkCards
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canPublish}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onView={setViewing}
          onEdit={(homework) => {
            setEditing(homework)
            setDialogOpen(true)
          }}
          onPublish={(homework) => publishMutation.mutate(homework.id)}
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

        <HomeworkFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
        <HomeworkDetailDialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }} homework={viewing} />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => { if (!open) setDeleting(null) }}
          title="Delete homework?"
          description={`This will permanently delete "${deleting?.title ?? ""}". Only drafts can be deleted.`}
          confirmLabel="Delete homework"
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