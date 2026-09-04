import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { SectionsCards, SectionsTable } from "@/components/sections/SectionsList"
import { SectionsToolbar } from "@/components/sections/SectionsToolbar"
import { SectionFormDialog } from "@/components/sections/SectionFormDialog"
import { useSections } from "@/hooks/useSections"
import type { SectionListItem } from "@/types/sections"

const SEARCH_DEBOUNCE_MS = 350

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function SectionsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SectionListItem | null>(null)

  const search = readParam(searchParams, "search")
  const classId = readParam(searchParams, "class")

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

  const applyClass = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParamsRef.current)
      if (value) next.set("class", value)
      else next.delete("class")
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  const { data, isPending, isError, refetch } = useSections({
    classId: classId || undefined,
    search: search || undefined,
  })

  const canEdit = can("sections:update")
  const canCreate = can("sections:create")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Sections"
          description="Manage sections under each class in the school's academic structure."
        />

        <SectionsToolbar
          search={searchDraft}
          classId={classId}
          canCreate={canCreate}
          onSearchChange={setSearchDraft}
          onClassChange={(value) => applyClass(value === "all" ? "" : value)}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />

        <SectionsTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={(section) => {
            setEditing(section)
            setDialogOpen(true)
          }}
        />
        <SectionsCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          canEdit={canEdit}
          onRetry={() => void refetch()}
          onEdit={(section) => {
            setEditing(section)
            setDialogOpen(true)
          }}
        />

        <SectionFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      </div>
    </PageContainer>
  )
}
