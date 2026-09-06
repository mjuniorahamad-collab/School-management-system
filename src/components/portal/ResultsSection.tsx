import { Badge } from "@/components/ui/badge"
import { usePortalResults } from "@/hooks/usePortal"
import { formatPercent } from "@/lib/format"
import type { PortalExamResult } from "@/types/portal"

function ExamPassBadge({ isPass, isAbsent }: { isPass: boolean | null; isAbsent: boolean }) {
  if (isAbsent) return <Badge variant="outline" className="bg-slate-500/10 text-slate-700 dark:text-slate-300">Absent</Badge>
  if (isPass === null) return <Badge variant="outline" className="bg-muted text-muted-foreground">Pending</Badge>
  if (isPass) return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Pass</Badge>
  return <Badge variant="outline" className="bg-destructive/10 text-destructive">Fail</Badge>
}

export function ResultsSection({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = usePortalResults(studentId)

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-muted" />
  }
  if (isError || !data) {
    return <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Could not load results.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{data.session.name}</span>
        <span>
          {data.student.name} · {data.student.admissionNumber}
        </span>
      </div>

      {data.results.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No results have been published for this session yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.results.map((exam: PortalExamResult) => (
            <div key={exam.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{exam.examName}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam.examTypeName ?? "School exam"}
                    {exam.rank !== null ? ` · Rank #${exam.rank}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {exam.isComplete ? (
                    <>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {exam.totalPercentage !== null ? formatPercent(exam.totalPercentage) : "—"}
                      </span>
                      {exam.grade ? <Badge variant="secondary">{exam.grade}</Badge> : null}
                      <ExamPassBadge isPass={exam.isPass} isAbsent={false} />
                    </>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">In progress</Badge>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">Subject</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Max</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Obtained</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">%</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Grade</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {exam.marks.map((mark) => (
                      <tr key={mark.subjectName} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium text-foreground">{mark.subjectName}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{mark.maxMarks}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{mark.isAbsent ? "—" : (mark.obtainedMarks ?? "—")}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {mark.percentage !== null && !mark.isAbsent ? formatPercent(mark.percentage) : "—"}
                        </td>
                        <td className="px-4 py-3">{mark.grade ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{mark.remarks ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}