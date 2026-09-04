import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { SessionsCards, SessionsTable } from "@/components/academicSessions/SessionsList"
import { SessionsToolbar } from "@/components/academicSessions/SessionsToolbar"
import { SessionFormDialog } from "@/components/academicSessions/SessionFormDialog"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import type { AcademicSessionListItem } from "@/types/academicSessions"

const SEARCH_DEBOUNCE_MS = 350

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function AcademicSessionsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AcademicSessionListItem | null>(null)

  const search = readParam(searchParams, "search")
  const status = readParam(searchParams, "status")

  const commitSearch = useCallback(
    (draft: string) => {
      const next = new URLSearchParams(searchParamsRef.current)
      if (draft) next.set("search", draft)
      else next.delete("search")
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== search) commitSearch(searchDraft)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, search, commitSearch])

  const applyStatus = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParamsRef.current)
      if (value) next.set("status", value)
      else next.delete("status")
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  const { data, isPending, isError, refetch } = useAcademicSessions({
    search: search || undefined,
    status: (status as "UPCOMING" | "ACTIVE" | "CLOSED") || undefined,
  })

  const canEdit = can("academic-sessions:update")
  const canCreate = can("academic-sessions:create")

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (session: AcademicSessionListItem) => {
    setEditing(session)
    setDialogOpen(true)
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Academic Sessions"
          description="Manage the academic years that structure student enrollment and placement."
        />

        <SessionsToolbar
          search={searchDraft}
          status={(status as "UPCOMING" | "ACTIVE" | "CLOSED") ?? ""}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onStatusChange={(value) => applyStatus(value === "all" ? "" : value)}
          onCreateClick={openCreate}
        />

        <SessionsTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={openEdit}
        />
        <SessionsCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={openEdit}
        />

        <SessionFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      </div>
    </PageContainer>
  )
}
