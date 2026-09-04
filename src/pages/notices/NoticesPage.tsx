import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { NoticesCards, NoticesTable } from "@/components/notices/NoticesList"
import { NoticesToolbar } from "@/components/notices/NoticesToolbar"
import { NoticeFormDialog } from "@/components/notices/NoticeFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useDeleteNotice, useNotices, usePublishNotice } from "@/hooks/useNotices"
import type { NoticeAudience, NoticeListItem, NoticeStatus } from "@/types/communication"

const SEARCH_DEBOUNCE_MS = 350

export function NoticesPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const readParam = (key: string) => searchParams.get(key) ?? ""

  const [searchDraft, setSearchDraft] = useState(() => readParam("search"))
  const status = (readParam("status") as NoticeStatus) || ""
  const audience = (readParam("audience") as NoticeAudience) || ""
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<NoticeListItem | null>(null)
  const [deleting, setDeleting] = useState<NoticeListItem | null>(null)

  const search = readParam("search")

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== search) {
        const next = new URLSearchParams(searchParamsRef.current)
        if (searchDraft) next.set("search", searchDraft)
        else next.delete("search")
        setSearchParams(next, { replace: true })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, search, setSearchParams])

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParamsRef.current)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const { data, isPending, isError, refetch } = useNotices({
    search: search || undefined,
    status: status || undefined,
    audience: audience || undefined,
  })

  const canEdit = can("notices:update")
  const canCreate = can("notices:create")
  const canDelete = can("notices:delete")
  const canPublish = can("notices:update")

  const publishMutation = usePublishNotice()
  const deleteMutation = useDeleteNotice()

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Notices"
          description="Create, publish, and manage announcements for students, parents, and staff."
        />
        <NoticesToolbar
          search={searchDraft}
          status={status}
          audience={audience}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onStatusChange={(value) => {
            updateFilter("status", value)
          }}
          onAudienceChange={(value) => {
            updateFilter("audience", value)
          }}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />
        <NoticesTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canPublish}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onEdit={(notice) => {
            setEditing(notice)
            setDialogOpen(true)
          }}
          onPublish={(notice) => {
            publishMutation.mutate(notice.id)
          }}
          onDelete={(notice) => setDeleting(notice)}
        />
        <NoticesCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canPublish={canPublish}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onEdit={(notice) => {
            setEditing(notice)
            setDialogOpen(true)
          }}
          onPublish={(notice) => {
            publishMutation.mutate(notice.id)
          }}
          onDelete={(notice) => setDeleting(notice)}
        />

        <NoticeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Delete notice?"
          description={`This will permanently delete "${deleting?.title ?? ""}". This action cannot be undone.`}
          confirmLabel="Delete notice"
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
