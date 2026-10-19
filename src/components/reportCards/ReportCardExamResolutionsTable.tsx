import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { reportCardExamTypeName, type ReportCardLabelMaps } from "@/lib/reportCardLifecycle"
import {
  reportCardExamResolutionReasonLabel,
  reportCardExamResolutionStatusLabel,
} from "@/lib/reportCardStatus"
import type { ReportCardDetail } from "@/types/reportCard"

const STATUS_CLASSES: Record<string, string> = {
  RESOLVED:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  NOT_FINAL:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  AMBIGUOUS:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  MISSING:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  OUT_OF_SCOPE: "",
}

/**
 * The frozen exam resolutions — how each configured exam resolved for this card.
 * Values come from the frozen snapshot (falling back to the persisted rows);
 * exam-type names are LIVE reference labels.
 */
export function ReportCardExamResolutionsTable({
  card,
  maps,
}: {
  card: ReportCardDetail
  maps: ReportCardLabelMaps
}) {
  const rows = card.snapshot?.examResolutions ?? card.examResolutions

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exam resolutions</CardTitle>
        <CardDescription data-slot="card-description">
          How each configured exam resolved · exam names are live reference labels
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No exam resolutions were recorded on this report card.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Exam</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 font-medium">Reason</th>
                  <th scope="col" className="py-2 pl-4 font-medium">Instance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((resolution) => (
                  <tr key={resolution.examTypeId}>
                    <td className="py-2.5 pr-4 font-medium text-foreground">
                      {reportCardExamTypeName(resolution.examTypeId, maps)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={STATUS_CLASSES[resolution.status]}>
                        {reportCardExamResolutionStatusLabel(resolution.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {reportCardExamResolutionReasonLabel(resolution.reason)}
                    </td>
                    <td className="py-2.5 pl-4 text-muted-foreground">
                      {resolution.examId ? "Linked" : "—"}
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
