import { PrintDocument, type PrintLetterheadIdentity } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintSignatureRow } from "@/components/print/PrintSignatures"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { PrintTotals } from "@/components/print/PrintTotals"
import { formatFullDate } from "@/lib/format"
import { formatReportCardCount, formatReportCardPercentage } from "@/lib/reportCardLifecycle"
import {
  reportCardAnnualResultLabel,
  reportCardExamResolutionReasonLabel,
  reportCardExamResolutionStatusLabel,
  reportCardMarkStatusLabel,
  reportCardSubjectOutcomeLabel,
  reportCardSubjectOutcomeReasonLabel,
} from "@/lib/reportCardStatus"
import type {
  ReportCardSnapshotGradingBand,
  ReportCardSnapshotV2,
  ReportCardSnapshotV2ExamResolution,
  ReportCardSnapshotV2Subject,
  ReportCardSnapshotV2SubjectMark,
} from "@/types/reportCard"

/**
 * The printed Annual Report Card.
 *
 * Every value is read from the frozen `ReportCardSnapshotV2` written at generation
 * time — never from a live student/class/subject/exam row — so a printed card can
 * never disagree with the version it was issued from. The document performs no
 * arithmetic of its own: outcomes, percentages, grades and the overall result are
 * printed exactly as the engine froze them.
 *
 * The per-exam marks matrix uses the frozen `marks` (obtained / maximum / status)
 * per subject. A mark that was not scored is shown by its frozen status (Absent,
 * Not applicable, Pending) and is never rendered as zero. Exam resolutions are a
 * separate workflow record (how each configured exam resolved) and are printed in
 * their own table; they never substitute for marks.
 *
 * Attendance, remarks, roll numbers, an overall grade and an issue date are absent
 * from the v2 contract, so they are deliberately not printed here.
 */
export function ReportCardPrintDocument({ snapshot }: { snapshot: ReportCardSnapshotV2 }) {
  const studentName = [snapshot.student.firstName, snapshot.student.middleName, snapshot.student.lastName]
    .filter((part): part is string => part !== null && part !== "")
    .join(" ")

  const identity: PrintLetterheadIdentity = {
    schoolName: snapshot.school.schoolName,
    tagline: snapshot.school.tagline,
    schoolShortName: snapshot.school.schoolShortName,
    contactPhone: snapshot.school.contactPhone,
    contactEmail: snapshot.school.contactEmail,
    addressLine1: snapshot.school.addressLine1,
    addressLine2: snapshot.school.addressLine2,
    city: snapshot.school.city,
    state: snapshot.school.state,
    postalCode: snapshot.school.postalCode,
    country: snapshot.school.country,
  }

  const subtitle = `${snapshot.class.name}${
    snapshot.section ? ` · Section ${snapshot.section.name}` : ""
  } · ${snapshot.session.name}`

  const meta = (
    <PrintFieldGrid
      columns={3}
      fields={[
        { label: "Student", value: studentName },
        { label: "Admission number", value: snapshot.student.admissionNumber },
        { label: "Academic session", value: snapshot.session.name },
        { label: "Class", value: snapshot.class.name },
        { label: "Section", value: snapshot.section?.name ?? "—" },
      ]}
    />
  )

  // One column per resolved concrete exam. Columns come from the frozen exam
  // resolutions (the authoritative list of exams this card covers), which also
  // supply the display name; the marks themselves come from each subject.
  const examColumns: { examId: string; label: string }[] = []
  const seenExamIds = new Set<string>()
  for (const resolution of snapshot.examResolutions) {
    if (resolution.examId === null || seenExamIds.has(resolution.examId)) continue
    seenExamIds.add(resolution.examId)
    examColumns.push({ examId: resolution.examId, label: resolution.examName ?? resolution.examTypeName })
  }

  const subjectColumns: PrintTableColumn<ReportCardSnapshotV2Subject>[] = [
    { key: "subject", header: "Subject", render: (subject) => subject.subjectName },
    ...examColumns.map((exam) => ({
      key: `exam-${exam.examId}`,
      header: exam.label,
      render: (subject: ReportCardSnapshotV2Subject) => formatMark(findMark(subject, exam.examId)),
    })),
    {
      key: "percentage",
      header: "Percentage",
      numeric: true,
      render: (subject) => formatReportCardPercentage(subject.percentage),
    },
    {
      key: "grade",
      header: "Grade",
      render: (subject) => subject.grade ?? "—",
    },
    {
      key: "outcome",
      header: "Outcome",
      render: (subject) => reportCardSubjectOutcomeLabel(subject.outcome),
    },
    {
      key: "reason",
      header: "Reason",
      render: (subject) => reportCardSubjectOutcomeReasonLabel(subject.reason),
    },
    { key: "core", header: "Core", render: (subject) => (subject.isCore ? "Core" : "—") },
  ]

  const gradingColumns: PrintTableColumn<ReportCardSnapshotGradingBand>[] = [
    { key: "grade", header: "Grade", render: (band) => band.grade },
    { key: "min", header: "Minimum %", numeric: true, render: (band) => String(band.minPercent) },
    { key: "max", header: "Maximum %", numeric: true, render: (band) => String(band.maxPercent) },
  ]

  const resolutionColumns: PrintTableColumn<ReportCardSnapshotV2ExamResolution>[] = [
    { key: "type", header: "Exam type", render: (resolution) => resolution.examTypeName },
    { key: "exam", header: "Examination", render: (resolution) => resolution.examName ?? "—" },
    { key: "dates", header: "Dates", render: (resolution) => formatExamDates(resolution) },
    {
      key: "status",
      header: "Resolution",
      render: (resolution) => reportCardExamResolutionStatusLabel(resolution.status),
    },
    {
      key: "reason",
      header: "Reason",
      render: (resolution) => reportCardExamResolutionReasonLabel(resolution.reason),
    },
  ]

  const signatories = snapshot.signatories.map((signatory) => ({
    role: signatory.role,
    name: signatory.name,
  }))

  return (
    <PrintDocument
      identity={identity}
      eyebrow="Report Cards"
      title="Annual Report Card"
      subtitle={subtitle}
      meta={meta}
      note="Printed from the frozen report-card snapshot (schema v2). Subject and exam names, marks and signatories are the historical values frozen at generation and are never read from live records. Attendance, remarks and an issue date are not part of the frozen contract and are therefore not shown."
    >
      <PrintSection title="Overall result">
        <PrintTotals
          variant="strip"
          items={[
            {
              label: "Result",
              value: reportCardAnnualResultLabel(snapshot.overall.result),
              emphasis: true,
            },
            { label: "Overall percentage", value: formatReportCardPercentage(snapshot.overall.percentage) },
            { label: "Failed subjects", value: formatReportCardCount(snapshot.overall.failedCount) },
            { label: "Resolved subjects", value: formatReportCardCount(snapshot.overall.resolvedSubjectCount) },
          ]}
        />
        {snapshot.overall.requiresReview && (
          <p className="print-document-note mt-2">
            Flagged for review: at least one subject outcome requires manual review.
          </p>
        )}
      </PrintSection>

      {/* The marks matrix can run long, so it uses a plain heading and paginates
          row-by-row rather than being pinned to one page by a section block. */}
      <h2 className="print-document-section mt-4">Performance</h2>
      <PrintTable
        compact
        columns={subjectColumns}
        rows={snapshot.subjects}
        rowKey={(subject) => subject.subjectId}
        emptyMessage="No subjects were recorded on this report card."
      />
      <p className="print-document-note mt-1">
        Each exam cell shows obtained marks / maximum marks. Where no score was recorded the frozen
        marking status is shown instead (Absent, Not applicable or Pending); a missing mark is never
        shown as zero.
      </p>

      {snapshot.scheme.gradingBands.length > 0 && (
        <PrintSection title="Grading scale">
          <PrintTable
            compact
            columns={gradingColumns}
            rows={snapshot.scheme.gradingBands}
            rowKey={(band, index) => `${band.grade}-${index}`}
            emptyMessage="No grading bands were recorded."
          />
        </PrintSection>
      )}

      <h2 className="print-document-section mt-4">Exam resolutions</h2>
      <PrintTable
        compact
        columns={resolutionColumns}
        rows={snapshot.examResolutions}
        rowKey={(resolution) => resolution.examTypeId}
        emptyMessage="No exam resolutions were recorded on this report card."
      />
      <p className="print-document-note mt-1">
        How each configured exam resolved for this card. This is workflow information and does not
        replace the marks above.
      </p>

      {signatories.length > 0 && <PrintSignatureRow entries={signatories} />}
    </PrintDocument>
  )
}

/** The frozen mark for one exam, or `undefined` when the subject had no entry. */
function findMark(
  subject: ReportCardSnapshotV2Subject,
  examId: string,
): ReportCardSnapshotV2SubjectMark | undefined {
  return subject.marks.find((mark) => mark.examId === examId)
}

/**
 * Renders one frozen mark. A scored mark prints "obtained / maximum"; any other
 * status prints its frozen label, so a missing mark can never be read as zero.
 */
function formatMark(mark: ReportCardSnapshotV2SubjectMark | undefined): string {
  if (mark === undefined) return "—"
  if (mark.status === "SCORED") {
    return `${mark.obtainedMarks ?? "—"} / ${mark.maxMarks}`
  }
  return reportCardMarkStatusLabel(mark.status)
}

/** A frozen exam's date range, or "—" when no concrete instance was frozen. */
function formatExamDates(resolution: ReportCardSnapshotV2ExamResolution): string {
  const start = resolution.examStartDate ? formatFullDate(resolution.examStartDate) : null
  const end = resolution.examEndDate ? formatFullDate(resolution.examEndDate) : null
  if (start !== null && end !== null) return start === end ? start : `${start} – ${end}`
  return start ?? end ?? "—"
}
