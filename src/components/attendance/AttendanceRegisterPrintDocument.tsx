import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintSignatureRow } from "@/components/print/PrintSignatures"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { formatFullDate } from "@/lib/format"
import type { AttendanceRecordListItem, AttendanceStatusType } from "@/types/attendance"

const STATUS_LABELS: Record<AttendanceStatusType, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  HOLIDAY: "Holiday",
}

export interface AttendancePrintScope {
  academicSession: string
  className: string
  sectionName: string
  date: string
}

/**
 * The printed attendance register.
 *
 * Decision D6: this document exists only for persisted records — it is built from
 * the Records list the API returned, never from the in-progress marking grid, so
 * paper can never show a mark the server has not accepted.
 *
 * Rows print the stored status, who recorded it and any note. The document adds no
 * tallies of its own: a count computed at print time could disagree with the
 * records if the data changed between the query and the paper. The only number it
 * prints is the number of rows on the sheet, which the reader can verify by
 * counting, and it is labelled as such rather than presented as a server total.
 *
 * Deliberately unframed: a rule around a document that may run to several pages
 * reads as a broken rectangle rather than a frame.
 */
export function AttendanceRegisterPrintDocument({
  records,
  scope,
}: {
  records: AttendanceRecordListItem[]
  scope: AttendancePrintScope
}) {
  const columns: PrintTableColumn<AttendanceRecordListItem>[] = [
    { key: "admission", header: "Admission no", width: "16%", render: (row) => row.admissionNumber },
    { key: "student", header: "Student", width: "30%", render: (row) => row.studentName },
    {
      key: "status",
      header: "Status",
      width: "14%",
      render: (row) => <span className="font-semibold">{STATUS_LABELS[row.status]}</span>,
    },
    {
      key: "markedBy",
      header: "Recorded by",
      width: "22%",
      render: (row) => row.markedByName ?? "—",
    },
    { key: "note", header: "Note", width: "18%", render: (row) => row.note ?? "—" },
  ]

  const fields = [
    { label: "Date", value: formatFullDate(scope.date) },
    { label: "Class", value: scope.className },
    { label: "Section", value: scope.sectionName },
    { label: "Session", value: scope.academicSession },
    { label: "Records on this sheet", value: String(records.length) },
  ]

  return (
    <PrintDocument
      eyebrow="Attendance"
      title="Attendance Register"
      subtitle={`${scope.className} · ${scope.sectionName} · ${formatFullDate(scope.date)}`}
      meta={<PrintFieldGrid fields={fields} columns={4} />}
      note="Printed from persisted attendance records. Every status is exactly as recorded by the server; this sheet computes no tally, percentage or summary of its own."
    >
      <PrintSection title="Register">
        <PrintTable
          columns={columns}
          rows={records}
          rowKey={(row) => row.id}
          emptyMessage="No attendance records for this date and class."
        />
      </PrintSection>
      <PrintSignatureRow roles={["Class teacher", "Principal"]} />
    </PrintDocument>
  )
}
