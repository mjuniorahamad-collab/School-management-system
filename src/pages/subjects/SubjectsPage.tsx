import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { SubjectsCards, SubjectsTable } from "@/components/subjects/SubjectsList"
import { SubjectsToolbar } from "@/components/subjects/SubjectsToolbar"
import { SubjectFormDialog } from "@/components/subjects/SubjectFormDialog"
import { useSubjects } from "@/hooks/useSubjects"
import type { SubjectListItem } from "@/types/subjects"

const SEARCH_DEBOUNCE_MS = 350

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function SubjectsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SubjectListItem | null>(null)

  const search = readParam(searchParams, "search")

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

  const { data, isPending, isError, refetch } = useSubjects({ search: search || undefined })

  const canEdit = can("subjects:update")
  const canCreate = can("subjects:create")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Subjects"
          description="Manage the subject catalog that structures teaching and assessment."
        />

        <SubjectsToolbar
          search={searchDraft}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />

        <SubjectsTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={(subject) => {
            setEditing(subject)
            setDialogOpen(true)
          }}
        />
        <SubjectsCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={(subject) => {
            setEditing(subject)
            setDialogOpen(true)
          }}
        />

        <SubjectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      </div>
    </PageContainer>
  )
}
