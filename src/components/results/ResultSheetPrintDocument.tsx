import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { EXAM_STATUS_LABELS } from "@/types/exams"
import { formatFullDate } from "@/lib/format"
import type { ResultSheet, ResultSheetRow, ResultSheetSubject } from "@/types/results"

/** Marks cells are strings in the DTO; an absent student prints as "A". */
function markText(cell: ResultSheetRow["marks"][number] | undefined): string {
  if (!cell) return "—"
  if (cell.isAbsent) return "A"
  return cell.obtainedMarks ?? "—"
}

/**
 * The printed result sheet (landscape).
 *
 * Every value is printed exactly as the server computed it — obtained marks,
 * percentages, grades, pass flags and competition ranks. The document deliberately
 * recomputes nothing: a sheet that graded differently from the system of record
 * would be worse than no sheet at all.
 *
 * The sheet endpoint is paginated, so the printed scope is stated on the document
 * itself. That scope is the SERVER's result-set pagination, and is worded as such:
 * "Result set page 1 of 3" cannot be mistaken for a paper page number, which
 * matters because a printed sheet may run to several physical pages this document
 * cannot number. The count comes from `pagination.total`, never from the rows on
 * this page.
 *
 * A grid rather than a `PrintTable` — the subject columns are derived from the
 * examination — but it still takes its type from the print scale and its cell
 * borders from the print stylesheet, and must hand-write neither.
 */
export function ResultSheetPrintDocument({ sheet }: { sheet: ResultSheet }) {
  const subjects = [...sheet.subjects].sort((a, b) => a.sortOrder - b.sortOrder)
  const { page, pageSize, total, totalPages } = sheet.pagination
  const incomplete = sheet.rows.filter((row) => !row.isComplete).length

  const subjectColumns: { key: string; header: string; render: (row: ResultSheetRow) => string }[] =
    subjects.map((subject: ResultSheetSubject) => ({
      key: subject.id,
      header: `${subject.subjectCode} /${subject.maxMarks}`,
      render: (row) => markText(row.marks.find((cell) => cell.examSubjectId === subject.id)),
    }))

  return (
    <PrintDocument
      eyebrow="Results"
      title="Result Sheet"
      subtitle={`${sheet.exam.className}${sheet.exam.sectionName !== null && sheet.exam.sectionName !== undefined && sheet.exam.sectionName !== "" ? ` · ${sheet.exam.sectionName}` : ""} · ${sheet.exam.academicSessionName}`}
      meta={
        <PrintFieldGrid
          fields={[
            { label: "Examination", value: sheet.exam.name },
            { label: "Type", value: sheet.exam.examTypeName },
            { label: "Status", value: EXAM_STATUS_LABELS[sheet.exam.status] },
            { label: "Session", value: sheet.exam.academicSessionName },
            { label: "Class", value: sheet.exam.className },
            { label: "Section", value: sheet.exam.sectionName ?? "Whole class" },
            { label: "Exam dates", value: `${formatFullDate(sheet.exam.startDate)} – ${formatFullDate(sheet.exam.endDate)}` },
            { label: "Finalized on", value: sheet.exam.finalizedAt !== null ? formatFullDate(sheet.exam.finalizedAt) : "Not yet" },
          ]}
          columns={4}
        />
      }
      note={
        `Result set page ${page} of ${totalPages} — showing ${sheet.rows.length} of ${total} students` +
        (incomplete > 0 ? ` · ${incomplete} row(s) still incomplete` : "") +
        ". Subject columns read “code /max marks”; an “A” marks a student recorded absent."
      }
    >
      <PrintSection title="Marks">
        <table className="print-document-table print-document-table-compact w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" style={{ width: "3%" }} className="text-left font-semibold">
                #
              </th>
              <th scope="col" style={{ width: "11%" }} className="text-left font-semibold">
                Admission no
              </th>
              <th scope="col" style={{ width: "19%" }} className="text-left font-semibold">
                Student
              </th>
              {subjectColumns.map((column) => (
                <th key={column.key} scope="col" className="text-center font-semibold">
                  {column.header}
                </th>
              ))}
              <th scope="col" style={{ width: "5%" }} className="text-right font-semibold">
                Total
              </th>
              <th scope="col" style={{ width: "5%" }} className="text-right font-semibold">
                %
              </th>
              <th scope="col" style={{ width: "4%" }} className="text-center font-semibold">
                Grade
              </th>
              <th scope="col" style={{ width: "5%" }} className="text-center font-semibold">
                Result
              </th>
              <th scope="col" style={{ width: "4%" }} className="text-center font-semibold">
                Rank
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 ? (
              <tr>
                <td colSpan={subjectColumns.length + 8} className="text-center">
                  No students are enrolled in this examination&apos;s class.
                </td>
              </tr>
            ) : (
              sheet.rows.map((row, index) => (
                <tr key={row.enrollmentId}>
                  <td className="text-right tabular-nums">{(page - 1) * pageSize + index + 1}</td>
                  <td>{row.admissionNumber}</td>
                  <td>{row.studentName}</td>
                  {subjectColumns.map((column) => (
                    <td key={column.key} className="text-center tabular-nums">
                      {column.render(row)}
                    </td>
                  ))}
                  <td className="text-right tabular-nums">{row.totalObtained ?? "—"}</td>
                  <td className="text-right tabular-nums">{row.totalPercentage ?? "—"}</td>
                  <td className="text-center font-semibold">{row.grade ?? "—"}</td>
                  <td className="text-center">
                    {row.isPass === null ? "—" : row.isPass ? "Pass" : "Fail"}
                  </td>
                  <td className="text-center tabular-nums">{row.rank ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PrintSection>
    </PrintDocument>
  )
}
