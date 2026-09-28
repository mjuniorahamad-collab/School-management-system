import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintSignatureRow } from "@/components/print/PrintSignatures"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { formatFullDate } from "@/lib/format"
import type { StudentDetail, StudentGuardianDetail } from "@/types/students"

/** "MOTHER" -> "Mother", matching how the screen renders these values. */
function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function joinAddress(student: StudentDetail): string {
  const parts = [
    student.addressLine1,
    student.addressLine2,
    student.city,
    student.state,
    student.postalCode,
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(", ") : "—"
}

/**
 * The printed student profile.
 *
 * A read-only profile sheet built entirely from the `StudentDetail` DTO: identity,
 * current placement, address and guardians. The photo is intentionally omitted —
 * the API returns a photo URL, and embedding a remote image in a print document
 * would either require a new authenticated fetch or print a broken box.
 *
 * Framed and un-paginated: a profile is a short single-page artifact. Only the
 * CURRENT placement is shown, because the DTO carries one enrollment; class history
 * is not synthesised here.
 */
export function StudentProfilePrintDocument({ student }: { student: StudentDetail }) {
  const place = student.enrollment

  const guardianColumns: PrintTableColumn<StudentGuardianDetail>[] = [
    { key: "name", header: "Guardian", width: "26%", render: (row) => row.name },
    { key: "relationship", header: "Relationship", width: "18%", render: (row) => titleCase(row.relationshipType) },
    { key: "phone", header: "Phone", width: "18%", render: (row) => row.phone ?? "—" },
    { key: "email", header: "Email", width: "24%", render: (row) => row.email ?? "—" },
    {
      key: "flags",
      header: "Flags",
      width: "14%",
      render: (row) =>
        [row.isPrimary ? "Primary" : null, row.isEmergencyContact ? "Emergency contact" : null]
          .filter((flag) => flag !== null)
          .join(", ") || "—",
    },
  ]

  const identityFields = [
    { label: "Admission number", value: student.admissionNumber },
    { label: "Name", value: student.name },
    { label: "Date of birth", value: formatFullDate(student.dateOfBirth) },
    { label: "Gender", value: titleCase(student.gender) },
    { label: "Status", value: titleCase(student.status) },
    { label: "Admitted on", value: formatFullDate(student.admissionDate) },
    { label: "Phone", value: student.phone ?? "—" },
    { label: "Email", value: student.email ?? "—" },
    { label: "Address", value: joinAddress(student) },
  ]

  const placementFields = place
    ? [
        { label: "Academic session", value: place.academicSession.name },
        { label: "Class", value: place.class.name },
        { label: "Section", value: place.section?.name ?? "—" },
      ]
    : []

  return (
    <PrintDocument
      frame
      eyebrow="Students"
      title="Student Profile"
      subtitle={student.admissionNumber}
      note="Identity, current placement and guardians exactly as recorded. Class history, attendance totals and fee standing are not shown: the profile record does not carry them."
    >
      <PrintSection title="Identity">
        <PrintFieldGrid fields={identityFields} columns={3} />
      </PrintSection>

      <PrintSection title="Current placement">
        {place === null || place === undefined ? (
          <p>No enrollment record for the current academic session.</p>
        ) : (
          <PrintFieldGrid fields={placementFields} columns={3} />
        )}
      </PrintSection>

      <PrintSection title="Emergency contact">
        <p>
          {student.emergencyContactName ?? "—"}
          {student.emergencyContactPhone !== null && student.emergencyContactPhone !== undefined && student.emergencyContactPhone !== ""
            ? ` · ${student.emergencyContactPhone}`
            : ""}
        </p>
      </PrintSection>

      <PrintSection title="Guardians">
        <PrintTable
          columns={guardianColumns}
          rows={student.guardians}
          rowKey={(row) => row.id}
          emptyMessage="No guardians on record."
        />
      </PrintSection>

      <PrintSignatureRow roles={["Class teacher", "Parent / Guardian"]} />
    </PrintDocument>
  )
}
