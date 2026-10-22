import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { GenerateReportCardDialog } from "@/components/reportCards/GenerateReportCardDialog"
import { ReportCardsCards, ReportCardsTable } from "@/components/reportCards/ReportCardsList"
import { ReportCardsPagination } from "@/components/reportCards/ReportCardsPagination"
import { ReportCardsToolbar } from "@/components/reportCards/ReportCardsToolbar"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useExamTypes } from "@/hooks/useMasterData"
import { useReportCards } from "@/hooks/useReportCards"
import { useClassesOptions, useSections } from "@/hooks/useSections"
import { useSubjects } from "@/hooks/useSubjects"
import { buildReportCardLabelMaps } from "@/lib/reportCardLifecycle"
import type { ReportCardStatus } from "@/types/reportCard"

const PAGE_SIZE = 20

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function ReportCardsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)

  const sessionsQuery = useAcademicSessions({})
  const classesQuery = useClassesOptions()
  const sectionsQuery = useSections({})
  const subjectsQuery = useSubjects({})
  // Report cards are historical documents: they must still be able to NAME an
  // exam type that was retired after the report card was generated.
  const examTypesQuery = useExamTypes({ includeInactive: true })

  const sessions = sessionsQuery.data?.items ?? []
  const defaultSessionId =
    sessions.find((session) => session.status === "ACTIVE")?.id ?? sessions[0]?.id ?? ""
  const sessionId = readParam(searchParams, "session") || defaultSessionId
  const classId = readParam(searchParams, "class")
  const sectionId = readParam(searchParams, "section")
  const status = readParam(searchParams, "status")
  const page = Math.max(1, Number(readParam(searchParams, "page")) || 1)

  const classes = classesQuery.data?.items ?? []
  const allSections = sectionsQuery.data?.items ?? []
  const classSections = allSections.filter((section) => section.classId === classId)

  const maps = useMemo(
    () =>
      buildReportCardLabelMaps({
        sessions: sessionsQuery.data?.items,
        classes: classesQuery.data?.items,
        sections: sectionsQuery.data?.items,
        subjects: subjectsQuery.data?.items,
        examTypes: examTypesQuery.data?.items,
      }),
    [
      sessionsQuery.data,
      classesQuery.data,
      sectionsQuery.data,
      subjectsQuery.data,
      examTypesQuery.data,
    ],
  )

  const cardsQuery = useReportCards({
    page,
    pageSize: PAGE_SIZE,
    academicSessionId: sessionId || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    status: (status as ReportCardStatus) || undefined,
  })

  const items = cardsQuery.data?.items ?? []
  const pagination = cardsQuery.data?.pagination
  const canGenerate = can("report-cards:generate")

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    setSearchParams(next, { replace: true })
  }

  const handleClassChange = (id: string) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set("class", id)
    else next.delete("class")
    next.delete("section")
    next.delete("page")
    setSearchParams(next, { replace: true })
  }

  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    next.set("page", String(nextPage))
    setSearchParams(next, { replace: true })
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Report Cards"
          description="Generate, review and issue annual report cards. Results are computed once and frozen into each version."
        />

        <ReportCardsToolbar
          sessions={sessions}
          sessionId={sessionId}
          onSessionChange={(id) => setParam("session", id)}
          classes={classes}
          classId={classId}
          onClassChange={handleClassChange}
          sections={classSections}
          sectionId={sectionId}
          onSectionChange={(id) => setParam("section", id)}
          status={status}
          onStatusChange={(value) => setParam("status", value)}
          canGenerate={canGenerate}
          onGenerateClick={() => setDialogOpen(true)}
        />

        <ReportCardsTable
          items={items}
          maps={maps}
          isPending={cardsQuery.isPending}
          isError={cardsQuery.isError}
          onRetry={() => void cardsQuery.refetch()}
        />
        <ReportCardsCards
          items={items}
          maps={maps}
          isPending={cardsQuery.isPending}
          isError={cardsQuery.isError}
          onRetry={() => void cardsQuery.refetch()}
        />

        {pagination && <ReportCardsPagination pagination={pagination} onPageChange={goToPage} />}

        {canGenerate && (
          <GenerateReportCardDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            defaultSessionId={sessionId}
          />
        )}
      </div>
    </PageContainer>
  )
}
