import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReportCardResultBadge, ReportCardStatusBadge } from "@/components/reportCards/ReportCardStatusBadge"
import { formatFullDate } from "@/lib/format"
import {
  describeReportCardScope,
  formatReportCardCount,
  formatReportCardPercentage,
  reportCardSessionName,
  type ReportCardLabelMaps,
} from "@/lib/reportCardLifecycle"
import type { ReportCardDetail } from "@/types/reportCard"

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

/**
 * The frozen overall summary. Every value shown here is read verbatim from the
 * card / its snapshot — nothing is recalculated on the client. Class, section,
 * session and student names are LIVE reference labels (not part of the snapshot)
 * resolved from the already-loaded option lists.
 */
export function ReportCardSummaryCard({
  card,
  maps,
}: {
  card: ReportCardDetail
  maps: ReportCardLabelMaps
}) {
  const overall = card.snapshot?.overall
  const result = overall?.result ?? card.overallResult
  const percentage = overall?.percentage ?? card.overallPercentage
  const failedCount = overall?.failedCount ?? card.failedCount
  const resolvedSubjectCount = overall?.resolvedSubjectCount ?? card.resolvedSubjectCount
  const requiresReview = overall?.requiresReview ?? card.requiresReview

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Overall result</CardTitle>
            <CardDescription data-slot="card-description">
              Frozen at generation · version {card.version}
            </CardDescription>
          </div>
          <ReportCardStatusBadge status={card.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <ReportCardResultBadge result={result} />
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {formatReportCardPercentage(percentage)}
          </span>
          {requiresReview && (
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Requires review
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Academic session">{reportCardSessionName(card.academicSessionId, maps)}</Field>
          <Field label="Class / section">{describeReportCardScope(card, maps)}</Field>
          <Field label="Failed subjects">{formatReportCardCount(failedCount)}</Field>
          <Field label="Resolved subjects">{formatReportCardCount(resolvedSubjectCount)}</Field>
          <Field label="Created">{formatFullDate(card.createdAt)}</Field>
          <Field label="Published">
            {card.publishedAt ? formatFullDate(card.publishedAt) : "—"}
          </Field>
          <Field label="Issued">{card.issuedAt ? formatFullDate(card.issuedAt) : "—"}</Field>
          <Field label="Schema version">{card.snapshot?.schemaVersion ?? "—"}</Field>
        </dl>

        {card.reissueReason && (
          <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
            <span className="text-xs font-medium text-muted-foreground">Reissue reason</span>
            <span className="text-sm text-foreground">{card.reissueReason}</span>
          </div>
        )}

        {card.supersedesReportCardId && (
          <p className="text-sm text-muted-foreground">
            Supersedes{" "}
            <Link
              to={`/report-cards/${card.supersedesReportCardId}`}
              className="font-medium text-primary hover:underline"
            >
              the previous version
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  )
}
