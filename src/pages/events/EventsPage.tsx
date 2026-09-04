import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { EventsCards, EventsTable } from "@/components/events/EventsList"
import { EventsToolbar } from "@/components/events/EventsToolbar"
import { EventFormDialog } from "@/components/events/EventFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useDeleteEvent, useEvents } from "@/hooks/useEvents"
import type { EventCategory, EventListItem, EventStatus } from "@/types/communication"

const SEARCH_DEBOUNCE_MS = 350

export function EventsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const readParam = (key: string) => searchParams.get(key) ?? ""

  const [searchDraft, setSearchDraft] = useState(() => readParam("search"))
  const [category, setCategory] = useState<EventCategory | "">(
    () => (readParam("category") as EventCategory) || "",
  )
  const [status, setStatus] = useState<EventStatus | "">(
    () => (readParam("status") as EventStatus) || "",
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EventListItem | null>(null)
  const [deleting, setDeleting] = useState<EventListItem | null>(null)

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

  const { data, isPending, isError, refetch } = useEvents({
    search: search || undefined,
    category: category || undefined,
    status: status || undefined,
  })

  const canEdit = can("events:update")
  const canCreate = can("events:create")
  const canDelete = can("events:delete")

  const deleteMutation = useDeleteEvent()

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Events"
          description="Schedule and manage events across the school calendar."
        />
        <EventsToolbar
          search={searchDraft}
          category={category}
          status={status}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onCategoryChange={(value) => {
            setCategory(value)
            updateFilter("category", value)
          }}
          onStatusChange={(value) => {
            setStatus(value)
            updateFilter("status", value)
          }}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />
        <EventsTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onEdit={(event) => {
            setEditing(event)
            setDialogOpen(true)
          }}
          onDelete={(event) => setDeleting(event)}
        />
        <EventsCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onEdit={(event) => {
            setEditing(event)
            setDialogOpen(true)
          }}
          onDelete={(event) => setDeleting(event)}
        />

        <EventFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Delete event?"
          description={`This will permanently delete "${deleting?.title ?? ""}". This action cannot be undone.`}
          confirmLabel="Delete event"
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
