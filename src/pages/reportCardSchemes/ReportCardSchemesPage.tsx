import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import {
  ReportCardSchemesCards,
  ReportCardSchemesTable,
} from "@/components/reportCardSchemes/ReportCardSchemesList"
import { ReportCardSchemesToolbar } from "@/components/reportCardSchemes/ReportCardSchemesToolbar"
import { ReportCardSchemeFormDialog } from "@/components/reportCardSchemes/ReportCardSchemeFormDialog"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useClassesOptions, useSections } from "@/hooks/useSections"
import { useReportCardSchemes } from "@/hooks/useReportCardSchemes"
import { buildSchemeScopeNames, matchesSectionFilter, SECTION_FILTER_ALL } from "@/lib/reportCardSchemeScope"
import type { ReportCardSchemeDetail } from "@/types/reportCardScheme"

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function ReportCardSchemesPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReportCardSchemeDetail | null>(null)

  const sessions = useAcademicSessions({}).data?.items ?? []
  const defaultSessionId =
    sessions.find((session) => session.status === "ACTIVE")?.id ?? sessions[0]?.id ?? ""
  const sessionId = readParam(searchParams, "session") || defaultSessionId
  const classId = readParam(searchParams, "class")
  const sectionFilter = readParam(searchParams, "section") || SECTION_FILTER_ALL

  const classes = useClassesOptions().data?.items ?? []
  const allSections = useSections({}).data?.items ?? []

  const classSections = allSections.filter((section) => section.classId === classId)
  const names = buildSchemeScopeNames(classes, allSections)

  const schemesQuery = useReportCardSchemes({
    academicSessionId: sessionId || undefined,
    classId: classId || undefined,
  })
  const items = useMemo(
    () => (schemesQuery.data?.items ?? []).filter((scheme) => matchesSectionFilter(scheme, sectionFilter)),
    [schemesQuery.data, sectionFilter],
  )

  const canManage = can("report-cards:manage-schemes")

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const handleClassChange = (id: string) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set("class", id)
    else next.delete("class")
    next.delete("section")
    setSearchParams(next, { replace: true })
  }

  const handleSectionChange = (value: string) => {
    setParam("section", value === SECTION_FILTER_ALL ? "" : value)
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Report Card Schemes"
          description="Configure how report cards aggregate exam marks, handle absences and decide an overall pass for each class or section."
        />

        <ReportCardSchemesToolbar
          sessions={sessions}
          sessionId={sessionId}
          onSessionChange={(id) => setParam("session", id)}
          classes={classes}
          classId={classId}
          onClassChange={handleClassChange}
          sections={classSections}
          sectionFilter={sectionFilter}
          onSectionFilterChange={handleSectionChange}
          canCreate={canManage}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />

        <ReportCardSchemesTable
          items={items}
          names={names}
          isPending={schemesQuery.isPending}
          isError={schemesQuery.isError}
          canEdit={canManage}
          onRetry={() => void schemesQuery.refetch()}
          onEdit={(scheme) => {
            setEditing(scheme)
            setDialogOpen(true)
          }}
        />
        <ReportCardSchemesCards
          items={items}
          names={names}
          isPending={schemesQuery.isPending}
          isError={schemesQuery.isError}
          canEdit={canManage}
          onRetry={() => void schemesQuery.refetch()}
          onEdit={(scheme) => {
            setEditing(scheme)
            setDialogOpen(true)
          }}
        />

        <ReportCardSchemeFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          defaultSessionId={sessionId}
          defaultClassId={classId}
          onEditExisting={setEditing}
        />
      </div>
    </PageContainer>
  )
}
