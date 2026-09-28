import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintSignatureRow } from "@/components/print/PrintSignatures"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { formatFullDate } from "@/lib/format"
import { EXAM_STATUS_LABELS, type ExamDetail, type ExamSubjectItem } from "@/types/exams"

/**
 * The printed exam schedule.
 *
 * Read-only by construction: it prints the published `ExamDetail` exactly as the
 * screen shows it, including the marks the API returned as strings (no re-parsing,
 * no rounding). The editing affordances on screen are not part of the document.
 *
 * Framed: an exam schedule is a short, single-page artifact, and the frame is what
 * makes it read as an official document rather than a loose list of subjects.
 * Room, date and seat allocation are deliberately absent — the examination record
 * does not carry them, and inventing them on paper would be worse than the gap.
 */
export function ExamSchedulePrintDocument({ exam }: { exam: ExamDetail }) {
  const subjectColumns: PrintTableColumn<ExamSubjectItem>[] = [
    { key: "code", header: "Code", width: "12%", render: (row) => row.subjectCode },
    { key: "subject", header: "Subject", width: "38%", render: (row) => row.subjectName },
    { key: "teacher", header: "Teacher", width: "28%", render: (row) => row.teacherName },
    { key: "max", header: "Max marks", width: "11%", numeric: true, render: (row) => row.maxMarks },
    { key: "pass", header: "Pass marks", width: "11%", numeric: true, render: (row) => row.passMarks },
  ]

  const fields = [
    { label: "Examination", value: exam.name },
    { label: "Type", value: exam.examTypeName },
    { label: "Status", value: EXAM_STATUS_LABELS[exam.status] },
    { label: "Class", value: exam.className },
    { label: "Section", value: exam.sectionName ?? "Whole class" },
    { label: "Session", value: exam.academicSessionName },
    { label: "Starts on", value: formatFullDate(exam.startDate) },
    { label: "Ends on", value: formatFullDate(exam.endDate) },
    { label: "Published on", value: exam.publishedAt !== null ? formatFullDate(exam.publishedAt) : "—" },
    { label: "Subjects", value: String(exam.subjects.length) },
  ]

  return (
    <PrintDocument
      frame
      eyebrow="Examinations"
      title="Examination Schedule"
      subtitle={`${exam.examTypeName} · ${exam.academicSessionName}`}
      meta={<PrintFieldGrid fields={fields} columns={4} />}
      note="Marks are printed exactly as the server returned them. Room, seat and reporting time are not shown because the examination record does not carry them."
    >
      <PrintSection title="Subjects and marks">
        <PrintTable
          columns={subjectColumns}
          rows={exam.subjects}
          rowKey={(row) => row.id}
          emptyMessage="No subjects are attached to this examination."
        />
      </PrintSection>
      <PrintSignatureRow roles={["Invigilator", "Examination officer"]} />
    </PrintDocument>
  )
}
