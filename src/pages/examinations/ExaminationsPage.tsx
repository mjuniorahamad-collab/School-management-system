import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ExaminationDetailDialog } from "@/components/examinations/ExaminationDetailDialog"
import { ExaminationFormDialog } from "@/components/examinations/ExaminationFormDialog"
import { ExaminationCards, ExaminationTable } from "@/components/examinations/ExaminationList"
import { ExaminationToolbar } from "@/components/examinations/ExaminationToolbar"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import {
  useArchiveExam,
  useDeleteExam,
  useExamList,
  usePublishExam,
} from "@/hooks/useExams"
import type { ExamListItem, ExamStatus } from "@/types/exams"

const SEARCH_DEBOUNCE_MS = 350

export function ExaminationsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const readParam = (key: string) => searchParams.get(key) ?? ""

  const [searchDraft, setSearchDraft] = useState(() => readParam("search"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ExamListItem | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ExamListItem | null>(null)

  const search = readParam("search")
  const status = readParam("status") as ExamStatus | ""
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

  const { data, isPending, isError, refetch } = useExamList({
    search: search || undefined,
    status: status || undefined,
    page,
    pageSize,
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const canCreate = can("exams:create")
  const canEdit = can("exams:update")
  const canDelete = can("exams:delete")

  const publishMutation = usePublishExam()
  const archiveMutation = useArchiveExam()
  const deleteMutation = useDeleteExam()

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Examinations"
          description="Schedule examination cycles, map subjects to teachers, and track lifecycle."
        />
        <ExaminationToolbar
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
        <ExaminationTable
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canEdit}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onView={(exam) => setViewingId(exam.id)}
          onEdit={(exam) => {
            setEditing(exam)
            setDialogOpen(true)
          }}
          onPublish={(exam) => publishMutation.mutate(exam.id)}
          onArchive={(exam) => archiveMutation.mutate(exam.id)}
          onDelete={setDeleting}
        />
        <ExaminationCards
          items={items}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canEdit}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onView={(exam) => setViewingId(exam.id)}
          onEdit={(exam) => {
            setEditing(exam)
            setDialogOpen(true)
          }}
          onPublish={(exam) => publishMutation.mutate(exam.id)}
          onArchive={(exam) => archiveMutation.mutate(exam.id)}
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

        <ExaminationFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
        <ExaminationDetailDialog
          examId={viewingId}
          onOpenChange={(open) => { if (!open) setViewingId(null) }}
          canUpdateSubjects={canEdit}
        />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => { if (!open) setDeleting(null) }}
          title="Delete examination?"
          description={`This will permanently delete "${deleting?.name ?? ""}". Only drafts can be deleted.`}
          confirmLabel="Delete examination"
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