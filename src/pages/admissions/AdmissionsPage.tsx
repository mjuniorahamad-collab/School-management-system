import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { AdmissionConvertDialog } from "@/components/admissions/AdmissionConvertDialog"
import { AdmissionFormDialog } from "@/components/admissions/AdmissionFormDialog"
import { AdmissionReviewDialog } from "@/components/admissions/AdmissionReviewDialog"
import { AdmissionsCards, AdmissionsTable } from "@/components/admissions/AdmissionsList"
import { AdmissionsToolbar } from "@/components/admissions/AdmissionsToolbar"
import { useAdmission, useAdmissions, useAdmissionsMeta, useDeleteAdmission } from "@/hooks/useAdmissions"
import type {
  AdmissionApplicationStatus,
  AdmissionListItem,
  AdmissionsQuery,
} from "@/types/admissions"

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 350

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function AdmissionsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))

  const page = Math.max(1, Number(readParam(searchParams, "page") || 1))
  const search = readParam(searchParams, "search")
  const status = readParam(searchParams, "status")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { data: editingDetail } = useAdmission(editingId ?? undefined)
  const [reviewing, setReviewing] = useState<AdmissionListItem | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const { data: convertingDetail } = useAdmission(convertingId ?? undefined)
  const [deleting, setDeleting] = useState<AdmissionListItem | null>(null)

  const applyChange = useCallback(
    (patch: Partial<Record<"search" | "status", string>>) => {
      const current = searchParamsRef.current
      const next = new URLSearchParams(current)
      Object.entries(patch).forEach(([key, value]) => {
        if (value) next.set(key, value)
        else next.delete(key)
      })
      next.delete("page")
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== search) applyChange({ search: searchDraft })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, search, applyChange])

  const goToPage = useCallback(
    (nextPage: number) => {
      const next = new URLSearchParams(searchParamsRef.current)
      next.set("page", String(nextPage))
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  const query: AdmissionsQuery = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: (status as AdmissionApplicationStatus) || undefined,
    sortBy: "createdAt",
    sortDir: "desc",
  }

  const { data, isPending, isError, refetch } = useAdmissions(query)
  const { data: meta } = useAdmissionsMeta()

  const canEdit = can("admissions:update")
  const canCreate = can("admissions:create")
  const canDelete = can("admissions:delete")
  const canReview = can("admissions:update")
  const canConvert = can("admissions:update")

  const deleteMutation = useDeleteAdmission()

  const openEdit = (application: AdmissionListItem) => {
    setEditingId(application.id)
    setDialogOpen(true)
  }

  const openConvert = (application: AdmissionListItem) => {
    setConvertingId(application.id)
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Admissions"
          description="Manage admission applications, review outcomes, and convert approved applicants into enrolled students."
        />
        <AdmissionsToolbar
          search={searchDraft}
          status={(status as AdmissionApplicationStatus) ?? ""}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onStatusChange={(value) => applyChange({ status: value })}
          onCreateClick={() => {
            setEditingId(null)
            setDialogOpen(true)
          }}
        />
        <AdmissionsTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canReview={canReview}
          canConvert={canConvert}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onEdit={openEdit}
          onReview={setReviewing}
          onConvert={openConvert}
          onDelete={setDeleting}
        />
        <AdmissionsCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          canReview={canReview}
          canConvert={canConvert}
          canDelete={canDelete}
          onRetry={() => void refetch()}
          onEdit={openEdit}
          onReview={setReviewing}
          onConvert={openConvert}
          onDelete={setDeleting}
        />

        {data && !isPending && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.pagination.total} application{data.pagination.total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {data.pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => goToPage(page + 1)}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <AdmissionFormDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditingId(null)
          }}
          editing={editingDetail ?? null}
          meta={meta}
        />
        <AdmissionReviewDialog application={reviewing} onOpenChange={(open) => !open && setReviewing(null)} />
        <AdmissionConvertDialog
          application={convertingDetail ?? null}
          onOpenChange={(open) => {
            if (!open) setConvertingId(null)
          }}
          meta={meta}
        />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Delete application?"
          description={`This will permanently delete the application for "${deleting?.name ?? ""}". This action cannot be undone.`}
          confirmLabel="Delete application"
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
