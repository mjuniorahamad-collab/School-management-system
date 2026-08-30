import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { PageContainer } from "@/components/layout/PageContainer"
import { StudentsCards, StudentsTable } from "@/components/students/StudentsTable"
import { StudentsPagination } from "@/components/students/StudentsPagination"
import { StudentsToolbar } from "@/components/students/StudentsToolbar"
import { useStudents } from "@/hooks/useStudents"
import { buildExportUrl } from "@/services/studentsService"
import type { StudentsQuery } from "@/types/students"

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 350

type FilterKey = "search" | "class" | "section" | "status" | "session"

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useLayoutEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))

  const page = Math.max(1, Number(readParam(searchParams, "page") || 1))
  const search = readParam(searchParams, "search")
  const classId = readParam(searchParams, "class")
  const sectionId = readParam(searchParams, "section")
  const status = readParam(searchParams, "status")
  const sessionId = readParam(searchParams, "session")

  const applyChange = useCallback(
    (patch: Partial<Record<FilterKey, string>>) => {
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

  const commitSearch = useCallback(
    (draft: string) => {
      const current = searchParamsRef.current
      const next = new URLSearchParams(current)
      if (draft) next.set("search", draft)
      else next.delete("search")
      next.delete("page")
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

  const goToPage = useCallback(
    (nextPage: number) => {
      const next = new URLSearchParams(searchParamsRef.current)
      next.set("page", String(nextPage))
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  const query: StudentsQuery = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: (status as StudentsQuery["status"]) || undefined,
    sessionId: sessionId || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    sortBy: "name",
    sortDir: "asc",
  }

  const { data, isPending, isError, refetch } = useStudents(query)

  const exportUrl = buildExportUrl({
    page: 1,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: (status as StudentsQuery["status"]) || undefined,
    sessionId: sessionId || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
  })

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <StudentsToolbar
          search={searchDraft}
          classId={classId}
          sectionId={sectionId}
          status={(status as StudentsQuery["status"]) ?? ""}
          sessionId={sessionId}
          exportHref={exportUrl}
          onSearchChange={setSearchDraft}
          onClassChange={(value) => {
            applyChange({ class: value === "all" ? "" : value, section: "" })
          }}
          onSectionChange={(value) => applyChange({ section: value === "all" ? "" : value })}
          onStatusChange={(value) => applyChange({ status: value })}
          onSessionChange={(value) => applyChange({ session: value === "all" ? "" : value })}
        />

        <StudentsTable
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
        />
        <StudentsCards
          items={data?.items ?? []}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
        />

        {data && !isPending && (
          <StudentsPagination pagination={data.pagination} onPageChange={goToPage} />
        )}
      </div>
    </PageContainer>
  )
}