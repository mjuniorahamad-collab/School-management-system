import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { ReportFilterPanel, isReportRunnable } from "@/components/reports/ReportFilterPanel"
import { ReportResult } from "@/components/reports/ReportResult"
import { ReportsCatalog } from "@/components/reports/ReportsCatalog"
import { ReportEmpty } from "@/components/reports/shared"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import {
  useAcademicPerformanceQuery,
  useAdmissionsSummaryQuery,
  useAttendanceSummaryQuery,
  useFeeCollectionQuery,
  usePaymentRegisterQuery,
  useReportCatalog,
  useReportExamOptions,
  useStudentRosterQuery,
} from "@/hooks/useReports"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useClassesOptions, useSections } from "@/hooks/useSections"
import { buildReportExportUrl } from "@/services/reportsService"
import {
  type AcademicPerformanceQuery,
  type AdmissionsSummaryQuery,
  type AttendanceSummaryQuery,
  type FeeCollectionQuery,
  isReportKey,
  type PaymentRegisterQuery,
  type ReportData,
  type ReportFiltersByKey,
  type ReportKey,
  type StudentRosterQuery,
} from "@/types/reports"

const PAGE_SIZE = 20

const EMPTY_FILTERS: ReportFiltersByKey = {
  "student-roster": { sessionId: "", classId: "", sectionId: "", search: "" },
  "admissions-summary": { from: "", to: "", status: "" },
  "attendance-summary": { sessionId: "", classId: "", sectionId: "", from: "", to: "" },
  "academic-performance": { sessionId: "", examId: "", classId: "" },
  "fee-collection": { sessionId: "", classId: "", status: "" },
  "payment-register": { from: "", to: "", method: "" },
}

type QueryByKey = {
  "student-roster": StudentRosterQuery
  "admissions-summary": AdmissionsSummaryQuery
  "attendance-summary": AttendanceSummaryQuery
  "academic-performance": AcademicPerformanceQuery
  "fee-collection": FeeCollectionQuery
  "payment-register": PaymentRegisterQuery
}

export function ReportsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawKey = searchParams.get("report")
  const selectedKey = isReportKey(rawKey) ? rawKey : null

  const [drafts, setDrafts] = useState<Partial<ReportFiltersByKey>>({})
  const [active, setActive] = useState<Partial<ReportFiltersByKey>>({})
  const [page, setPage] = useState(1)

  const catalogQuery = useReportCatalog()
  const sessionsQuery = useAcademicSessions({})
  const classesQuery = useClassesOptions()

  const needsSections = selectedKey === "student-roster" || selectedKey === "attendance-summary"
  const sectionClassId = needsSections && selectedKey
    ? (drafts[selectedKey]?.classId || undefined)
    : undefined
  const sectionsQuery = useSections({ classId: sectionClassId })

  const academicSessionId = selectedKey === "academic-performance"
    ? drafts[selectedKey]?.sessionId || null
    : null
  const examsQuery = useReportExamOptions(academicSessionId)

  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data])
  const sessions = sessionsQuery.data?.items ?? []
  const classes = classesQuery.data?.items ?? []
  const sections = sectionsQuery.data?.items ?? []
  const exams = examsQuery.data ?? []

  const currentReport = useMemo(
    () => catalog.find((item) => item.key === selectedKey) ?? null,
    [catalog, selectedKey],
  )

  function selectReport(key: string) {
    if (!isReportKey(key)) return
    const next = new URLSearchParams(searchParams)
    next.set("report", key)
    setSearchParams(next, { replace: false })
  }

  function updateDraft<K extends ReportKey>(key: K, patch: Partial<ReportFiltersByKey[K]>): void {
    setDrafts((prev) => {
      const current = prev[key] ?? EMPTY_FILTERS[key]
      return { ...prev, [key]: { ...current, ...patch } as ReportFiltersByKey[K] }
    })
  }

  function handleFilterChange(key: ReportKey, field: string, value: string): void {
    if (key === "academic-performance" && field === "sessionId") {
      updateDraft(key, { sessionId: value, examId: "" })
      return
    }
    updateDraft(key, { [field]: value } as Partial<ReportFiltersByKey[typeof key]>)
  }

  function runReport(key: ReportKey): void {
    const snapshot = drafts[key] ?? EMPTY_FILTERS[key]
    setPage(1)
    setActive((prev) => ({ ...prev, [key]: snapshot }))
  }

  function activeQueryFor<K extends ReportKey>(key: K): QueryByKey[K] | null {
    const filters = active[key]
    if (!filters || !isReportRunnable(key, filters as unknown as Record<string, string>)) return null
    const f = filters as unknown as Record<string, string>
    switch (key) {
      case "student-roster":
        return {
          page,
          pageSize: PAGE_SIZE,
          sessionId: f.sessionId,
          classId: f.classId || undefined,
          sectionId: f.sectionId || undefined,
          search: f.search.trim() || undefined,
        } as QueryByKey[K]
      case "admissions-summary":
        return { from: f.from, to: f.to, status: f.status || undefined } as QueryByKey[K]
      case "attendance-summary":
        return {
          sessionId: f.sessionId,
          classId: f.classId || undefined,
          sectionId: f.sectionId || undefined,
          from: f.from || undefined,
          to: f.to || undefined,
        } as QueryByKey[K]
      case "academic-performance":
        return { sessionId: f.sessionId, examId: f.examId, classId: f.classId || undefined } as QueryByKey[K]
      case "fee-collection":
        return { sessionId: f.sessionId, classId: f.classId || undefined, status: f.status || undefined } as QueryByKey[K]
      case "payment-register":
        return { page, pageSize: PAGE_SIZE, from: f.from, to: f.to, method: f.method || undefined } as QueryByKey[K]
    }
  }

  const rosterQuery = useStudentRosterQuery(selectedKey === "student-roster" ? activeQueryFor("student-roster") : null)
  const admissionsQuery = useAdmissionsSummaryQuery(selectedKey === "admissions-summary" ? activeQueryFor("admissions-summary") : null)
  const attendanceQuery = useAttendanceSummaryQuery(selectedKey === "attendance-summary" ? activeQueryFor("attendance-summary") : null)
  const academicQuery = useAcademicPerformanceQuery(selectedKey === "academic-performance" ? activeQueryFor("academic-performance") : null)
  const feeQuery = useFeeCollectionQuery(selectedKey === "fee-collection" ? activeQueryFor("fee-collection") : null)
  const registerQuery = usePaymentRegisterQuery(selectedKey === "payment-register" ? activeQueryFor("payment-register") : null)

  const RESULTS: Record<ReportKey, { data: ReportData | undefined; isPending: boolean; isError: boolean; refetch: () => void }> = {
    "student-roster": rosterQuery,
    "admissions-summary": admissionsQuery,
    "attendance-summary": attendanceQuery,
    "academic-performance": academicQuery,
    "fee-collection": feeQuery,
    "payment-register": registerQuery,
  }

  const result = selectedKey ? RESULTS[selectedKey] : null
  const hasRun = Boolean(selectedKey && active[selectedKey] && isReportRunnable(
    selectedKey,
    (active[selectedKey] ?? EMPTY_FILTERS[selectedKey]) as unknown as Record<string, string>,
  ))

  function exportHrefFor(key: ReportKey): string | null {
    const filters = active[key]
    if (!filters) return null
    const record: Record<string, string | undefined> = {}
    for (const [field, value] of Object.entries(filters)) {
      if (value) record[field] = value
    }
    return buildReportExportUrl(key, record)
  }

  let totalPages = 1
  if (selectedKey === "student-roster" && rosterQuery.data) {
    totalPages = rosterQuery.data.pagination.totalPages
  } else if (selectedKey === "payment-register" && registerQuery.data) {
    totalPages = registerQuery.data.pagination.totalPages
  }

  const canExport = can("reports:export")
  const canView = can("reports:view")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Reports"
          description="Run predefined reports across academic and financial data. Exports are audited."
        />

        {!canView ? (
          <ReportEmpty message="You do not have permission to view reports." />
        ) : (
          <>
            <ReportsCatalog items={catalog} selectedKey={selectedKey} onSelect={selectReport} />

            {selectedKey && currentReport && (
              <section className="flex flex-col gap-3 print:hidden">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{currentReport.title}</h2>
                  <p className="text-sm text-muted-foreground">{currentReport.description}</p>
                </div>
                <ReportFilterPanel
                  report={currentReport}
                  filters={(drafts[selectedKey] ?? EMPTY_FILTERS[selectedKey]) as unknown as Record<string, string>}
                  canRun={isReportRunnable(
                    selectedKey,
                    (drafts[selectedKey] ?? EMPTY_FILTERS[selectedKey]) as unknown as Record<string, string>,
                  )}
                  sessions={sessions}
                  classes={classes}
                  sections={sections}
                  exams={exams}
                  examsPending={examsQuery.isPending}
                  onChange={(field, value) => handleFilterChange(selectedKey, field, value)}
                  onRun={() => runReport(selectedKey)}
                />
                {hasRun && result ? (
                  <ReportResult
                    report={currentReport}
                    data={result.data}
                    isPending={result.isPending}
                    isError={result.isError}
                    onRetry={result.refetch}
                    canExport={canExport}
                    exportHref={exportHrefFor(selectedKey)}
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                ) : (
                  <ReportEmpty message="Set the filters above and press “Run report” to load the results." />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </PageContainer>
  )
}