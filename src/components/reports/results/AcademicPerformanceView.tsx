import { formatFullDate, formatPercent } from "@/lib/format"
import { ReportEmpty, ReportStatGrid, TableShell } from "@/components/reports/shared"
import type { AcademicPerformanceReport } from "@/types/reports"

export function AcademicPerformanceView({ report }: { report: AcademicPerformanceReport }) {
  const { exam, summary } = report
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10 sm:grid-cols-4">
        <MetaCard label="Examination" value={exam.name} />
        <MetaCard label="Type" value={exam.examTypeName} />
        <MetaCard
          label="Target"
          value={`${exam.className}${exam.sectionName ? ` · ${exam.sectionName}` : " · Whole class"}`}
        />
        <MetaCard
          label="Published"
          value={exam.publishedAt ? formatFullDate(exam.publishedAt) : "Not yet"}
        />
      </div>

      <ReportStatGrid
        stats={[
          { label: "Students", value: String(summary.students), tone: "default" },
          { label: "Completed", value: String(summary.completeStudents), tone: "positive" },
          {
            label: "Average score",
            value: summary.averagePercentage === null ? "—" : formatPercent(summary.averagePercentage, 1),
            tone: "default",
          },
          { label: "Passed", value: String(summary.passCount), tone: "positive" },
          {
            label: "Pass rate",
            value: summary.passRate === null ? "—" : formatPercent(summary.passRate, 1),
            tone: "default",
          },
        ]}
      />

      {summary.subjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {summary.subjects.map((subject) => (
            <span
              key={subject.examSubjectId}
              className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
            >
              {subject.subjectName}:{" "}
              {subject.averagePercentage === null ? "—" : formatPercent(subject.averagePercentage, 0)}
            </span>
          ))}
        </div>
      )}

      {report.classes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Class standing</h3>
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Rank</th>
                  <th scope="col" className="px-4 py-3 font-medium">Class</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Score</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Students</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.classes.map((row) => (
                  <tr key={row.className} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 tabular-nums">{row.rank}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.className}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPercent(row.performance, 1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.students}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}

      {report.items.length === 0 ? (
        <ReportEmpty message="No results were found for this examination." />
      ) : (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Students</h3>
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Rank</th>
                  <th scope="col" className="px-4 py-3 font-medium">Admission</th>
                  <th scope="col" className="px-4 py-3 font-medium">Student</th>
                  <th scope="col" className="px-4 py-3 font-medium">Class</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Score</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">%</th>
                  <th scope="col" className="px-4 py-3 font-medium">Grade</th>
                  <th scope="col" className="px-4 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.items.map((item) => (
                  <tr key={item.studentId} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 tabular-nums">{item.rank ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {item.admissionNumber}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{item.studentName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {item.className}
                      {item.sectionName ? ` · ${item.sectionName}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.totalObtained === null || item.totalMaxMarks === null
                        ? "—"
                        : `${item.totalObtained}/${item.totalMaxMarks}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.totalPercentage === null ? "—" : formatPercent(item.totalPercentage, 1)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{item.grade ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.isPass === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <PassFail isPass={item.isPass} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  )
}

function PassFail({ isPass }: { isPass: boolean }) {
  return (
    <span
      className={
        isPass
          ? "rounded-full border bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
          : "rounded-full border bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
      }
    >
      {isPass ? "Pass" : "Fail"}
    </span>
  )
}