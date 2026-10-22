import { useMemo } from "react"
import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PrintButton } from "@/components/print/PrintButton"
import { ReportCardExamResolutionsTable } from "@/components/reportCards/ReportCardExamResolutionsTable"
import { ReportCardLifecycleActions } from "@/components/reportCards/ReportCardLifecycleActions"
import { ReportCardPrintDocument } from "@/components/reportCards/ReportCardPrintDocument"
import { ReportCardStatusBadge } from "@/components/reportCards/ReportCardStatusBadge"
import { ReportCardSubjectsTable } from "@/components/reportCards/ReportCardSubjectsTable"
import { ReportCardSummaryCard } from "@/components/reportCards/ReportCardSummaryCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useExamTypes } from "@/hooks/useMasterData"
import { useReportCard } from "@/hooks/useReportCard"
import { useClassesOptions, useSections } from "@/hooks/useSections"
import { useSubjects } from "@/hooks/useSubjects"
import { buildReportCardLabelMaps } from "@/lib/reportCardLifecycle"

export function ReportCardDetailPage() {
  const { id = "" } = useParams()
  const { can } = useAuth()
  const { data: card, isPending, isError, refetch } = useReportCard(id)

  const sessionsQuery = useAcademicSessions({})
  const classesQuery = useClassesOptions()
  const sectionsQuery = useSections({})
  const subjectsQuery = useSubjects({})
  // Report cards are historical documents: they must still be able to NAME an
  // exam type that was retired after the report card was generated.
  const examTypesQuery = useExamTypes({ includeInactive: true })

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

  const studentName = card
    ? [card.student.firstName, card.student.lastName].filter(Boolean).join(" ")
    : ""

  // Only a schema v2 snapshot freezes the human-readable identity a complete
  // official card is printed from. Older snapshots must never be backfilled from
  // live data, so printing is disabled for them (see the notice below).
  const snapshot = card?.snapshot
  const snapshotV2 = snapshot && snapshot.schemaVersion === 2 ? snapshot : null

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/report-cards">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to report cards
          </Link>
        </Button>
        {can("report-cards:view") && card && (
          <PrintButton
            documentTitle={`Annual Report Card ${card.student.admissionNumber} v${card.version}`}
            disabled={snapshotV2 === null}
          >
            Print report card
          </PrintButton>
        )}
      </div>

      {isPending && (
        <div className="print:hidden">
          <ReportCardDetailSkeleton />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center print:hidden">
          <p className="text-sm text-muted-foreground">Could not load this report card.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {card && snapshotV2 === null && (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground print:hidden">
          The complete official print is unavailable for this version: it predates the schema v2
          snapshot that freezes the school, student and subject details. Regenerate the report card
          to print a frozen, complete card.
        </div>
      )}

      {card && (
        <div className="flex flex-col gap-4 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{studentName}</h1>
            <ReportCardStatusBadge status={card.status} />
            <span className="text-sm text-muted-foreground tabular-nums">
              {card.student.admissionNumber} · version {card.version}
            </span>
          </div>

          <ReportCardSummaryCard card={card} maps={maps} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReportCardSubjectsTable card={card} maps={maps} />
            <ReportCardExamResolutionsTable card={card} maps={maps} />
          </div>

          <ReportCardLifecycleActions card={card} />
        </div>
      )}

      {snapshotV2 && <ReportCardPrintDocument snapshot={snapshotV2} />}
    </PageContainer>
  )
}

function ReportCardDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-8 w-32" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
