import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { ClassesCards, ClassesTable } from "@/components/classes/ClassesList"
import { ClassesToolbar } from "@/components/classes/ClassesToolbar"
import { ClassFormDialog } from "@/components/classes/ClassFormDialog"
import { useClasses } from "@/hooks/useClasses"
import type { ClassListItem } from "@/types/classes"

const SEARCH_DEBOUNCE_MS = 350

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function ClassesPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ClassListItem | null>(null)

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

  const { data, isPending, isError, refetch } = useClasses({ search: search || undefined })

  const canEdit = can("classes:update")
  const canCreate = can("classes:create")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Classes"
          description="Manage the classes that make up the school's academic structure."
        />

        <ClassesToolbar
          search={searchDraft}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />

        <ClassesTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={(cls) => {
            setEditing(cls)
            setDialogOpen(true)
          }}
        />
        <ClassesCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={(cls) => {
            setEditing(cls)
            setDialogOpen(true)
          }}
        />

        <ClassFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      </div>
    </PageContainer>
  )
}
