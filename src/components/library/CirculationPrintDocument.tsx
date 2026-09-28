import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { formatShortDate } from "@/lib/format"
import {
  LIBRARY_BORROWER_TYPE_LABELS,
  LIBRARY_LOAN_STATUS_LABELS,
  type LibraryLoanListItem,
} from "@/types/library"

export interface CirculationPrintScope {
  /** The filter the user is looking at, in words — "Overdue", "All", … */
  filterLabel: string
  /** The search term applied, or null when the list is unsearched. */
  search: string | null
  /** Total rows in the filtered set, as reported by the API. */
  total: number
}

/**
 * The printed library circulation register.
 *
 * Prints the complete filtered set, not the visible page (decision D4). The
 * document repeats the filter and search that produced it and the API's own row
 * count, so a reader can always tell what the sheet covers — and the count is
 * stated by the server, never recomputed here.
 *
 * Nine columns on portrait A4 needs the compact density and explicit widths:
 * without them the date columns wrap onto two lines each and the register runs
 * half again as long as it needs to. Deliberately unframed.
 */
export function CirculationPrintDocument({
  loans,
  scope,
}: {
  loans: LibraryLoanListItem[]
  scope: CirculationPrintScope
}) {
  const columns: PrintTableColumn<LibraryLoanListItem>[] = [
    { key: "copy", header: "Copy", width: "9%", render: (row) => row.copyCode },
    { key: "book", header: "Book", width: "21%", render: (row) => row.bookTitle },
    { key: "borrower", header: "Borrower", width: "18%", render: (row) => row.borrowerName },
    {
      key: "borrowerCode",
      header: "Code",
      width: "9%",
      render: (row) => row.borrowerCode ?? "—",
    },
    {
      key: "type",
      header: "Type",
      width: "8%",
      render: (row) => LIBRARY_BORROWER_TYPE_LABELS[row.borrowerType],
    },
    { key: "issued", header: "Issued", width: "9%", render: (row) => formatShortDate(row.issuedAt) },
    { key: "due", header: "Due", width: "9%", render: (row) => formatShortDate(row.dueAt) },
    {
      key: "returned",
      header: "Returned",
      width: "9%",
      render: (row) => (row.returnedAt ? formatShortDate(row.returnedAt) : "—"),
    },
    {
      key: "status",
      header: "Status",
      width: "8%",
      render: (row) => <span className="font-semibold">{LIBRARY_LOAN_STATUS_LABELS[row.status]}</span>,
    },
  ]

  const fields = [
    { label: "Filter", value: scope.filterLabel },
    { label: "Search", value: scope.search ?? "None applied" },
    { label: "Loans in this register", value: String(scope.total) },
  ]

  return (
    <PrintDocument
      eyebrow="Library"
      title="Library Circulation Register"
      subtitle={`${scope.filterLabel}${scope.search !== null && scope.search !== "" ? ` · “${scope.search}”` : ""}`}
      meta={<PrintFieldGrid fields={fields} columns={3} />}
      note={`Complete filtered register — ${scope.total} loan${scope.total === 1 ? "" : "s"} as counted by the server. This is a record of issue and return only; no due-date, fine or age figure is calculated on this sheet.`}
    >
      <PrintSection title="Circulation">
        <PrintTable
          compact
          columns={columns}
          rows={loans}
          rowKey={(row) => row.id}
          emptyMessage="No loans match this filter."
        />
      </PrintSection>
    </PrintDocument>
  )
}
