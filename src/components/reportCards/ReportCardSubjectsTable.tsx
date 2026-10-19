import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReportCardSubjectOutcomeBadge } from "@/components/reportCards/ReportCardStatusBadge"
import { formatReportCardPercentage, reportCardSubjectName, type ReportCardLabelMaps } from "@/lib/reportCardLifecycle"
import { reportCardSubjectOutcomeReasonLabel } from "@/lib/reportCardStatus"
import type { ReportCardDetail } from "@/types/reportCard"

/**
 * The frozen per-subject breakdown. Values come from the frozen snapshot (and
 * fall back to the persisted frozen subject rows when a snapshot is absent);
 * subject names are LIVE reference labels resolved from the option lists.
 */
export function ReportCardSubjectsTable({
  card,
  maps,
}: {
  card: ReportCardDetail
  maps: ReportCardLabelMaps
}) {
  const rows = card.snapshot?.subjects ?? card.subjects

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subjects</CardTitle>
        <CardDescription data-slot="card-description">
          Frozen per-subject outcome · subject names are live reference labels
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects were recorded on this report card.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Subject</th>
                  <th scope="col" className="px-4 py-2 font-medium">Core</th>
                  <th scope="col" className="px-4 py-2 font-medium">Outcome</th>
                  <th scope="col" className="px-4 py-2 font-medium">Percentage</th>
                  <th scope="col" className="px-4 py-2 font-medium">Grade</th>
                  <th scope="col" className="px-4 py-2 font-medium">Reason</th>
                  <th scope="col" className="py-2 pl-4 font-medium">Exams</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((subject) => (
                  <tr key={subject.subjectId}>
                    <td className="py-2.5 pr-4 font-medium text-foreground">
                      {reportCardSubjectName(subject.subjectId, maps)}
                    </td>
                    <td className="px-4 py-2.5">
                      {subject.isCore ? <Badge variant="outline">Core</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <ReportCardSubjectOutcomeBadge outcome={subject.outcome} />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-foreground">
                      {formatReportCardPercentage(subject.percentage)}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{subject.grade ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {reportCardSubjectOutcomeReasonLabel(subject.reason)}
                    </td>
                    <td className="py-2.5 pl-4 text-xs text-muted-foreground tabular-nums">
                      {subject.includedExamIds.length} incl · {subject.excludedExamIds.length} excl ·{" "}
                      {subject.absentExamIds.length} absent
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
