import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { formatShortDate } from "@/lib/format"
import {
  TRANSPORT_ASSIGNMENT_STATUS_LABELS,
  TRANSPORT_DIRECTION_LABELS,
  type TransportAssignmentListItem,
} from "@/types/transport"

export interface TransportPrintScope {
  session: string
  route: string
  direction: string
  status: string
  search: string | null
  /** Total rows in the filtered set, as reported by the API. */
  total: number
}

/**
 * The printed transport route passenger list.
 *
 * Prints the complete filtered set rather than the visible page (decision D4), and
 * states each active filter plus the server's own row count so the sheet is
 * self-describing. The vehicle columns are printed only when the API returned
 * them — a null registration is reported as "—", never invented.
 *
 * Used as a boarding manifest, so the passenger name and stop carry the widest
 * columns and the list stays unframed.
 */
export function RoutePassengerListPrintDocument({
  assignments,
  scope,
}: {
  assignments: TransportAssignmentListItem[]
  scope: TransportPrintScope
}) {
  const columns: PrintTableColumn<TransportAssignmentListItem>[] = [
    { key: "admission", header: "Admission no", width: "15%", render: (row) => row.admissionNumber },
    { key: "student", header: "Student", width: "24%", render: (row) => row.studentName },
    { key: "session", header: "Session", width: "12%", render: (row) => row.sessionName },
    { key: "stop", header: "Stop", width: "16%", render: (row) => row.stopName },
    {
      key: "direction",
      header: "Direction",
      width: "10%",
      render: (row) => TRANSPORT_DIRECTION_LABELS[row.direction],
    },
    {
      key: "vehicle",
      header: "Vehicle",
      width: "9%",
      render: (row) => row.vehicleRegistration ?? "—",
    },
    { key: "assigned", header: "Assigned", width: "7%", render: (row) => formatShortDate(row.assignedAt) },
    {
      key: "status",
      header: "Status",
      width: "7%",
      render: (row) => <span className="font-semibold">{TRANSPORT_ASSIGNMENT_STATUS_LABELS[row.status]}</span>,
    },
  ]

  const fields = [
    { label: "Route", value: scope.route },
    { label: "Session", value: scope.session },
    { label: "Direction", value: scope.direction },
    { label: "Status", value: scope.status },
    { label: "Search", value: scope.search ?? "None applied" },
    { label: "Passengers in this list", value: String(scope.total) },
  ]

  return (
    <PrintDocument
      eyebrow="Transport"
      title="Route Passenger List"
      subtitle={`${scope.route} · ${scope.session} · ${scope.direction}`}
      meta={<PrintFieldGrid fields={fields} columns={3} />}
      note={`Complete filtered list — ${scope.total} assignment${scope.total === 1 ? "" : "s"} as counted by the server. Boarding and drop times are not shown because the assignment record does not carry them.`}
    >
      <PrintSection title="Passengers">
        <PrintTable
          compact
          columns={columns}
          rows={assignments}
          rowKey={(row) => row.id}
          emptyMessage="No passengers match this filter."
        />
      </PrintSection>
    </PrintDocument>
  )
}
