import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintSignatureRow } from "@/components/print/PrintSignatures"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { PrintTotals } from "@/components/print/PrintTotals"
import { formatFullDate, formatINR } from "@/lib/format"
import {
  INVOICE_STATUS_LABELS,
  type FeeInvoiceDetail,
  type FeeInvoiceInstallment,
  type FeeInvoiceItemSnapshot,
} from "@/types/fees"

/**
 * The printed fee invoice.
 *
 * Decision D3: the invoice prints canonical net values only. Every amount below is
 * a field of the `FeeInvoiceDetail` DTO — the same numbers the screen shows and
 * the same ones payments are validated against. Nothing is grossed up, discounted
 * or re-derived here, and the amount still owed is labelled "Total payable" so the
 * document states what the payer owes rather than how it was arrived at.
 *
 * Structure differs from the receipt on purpose: a receipt leads with one figure,
 * an invoice leads with a breakdown table and closes with the totals. Same design
 * language, different shape.
 */
export function InvoicePrintDocument({ invoice }: { invoice: FeeInvoiceDetail }) {
  const itemColumns: PrintTableColumn<FeeInvoiceItemSnapshot>[] = [
    { key: "code", header: "Code", width: "18%", render: (item) => item.feeHeadCode },
    { key: "name", header: "Fee head", render: (item) => item.feeHeadName },
    { key: "amount", header: "Amount", numeric: true, width: "26%", render: (item) => formatINR(item.amount) },
  ]

  const installmentColumns: PrintTableColumn<FeeInvoiceInstallment>[] = [
    { key: "no", header: "#", numeric: true, width: "6%", render: (row) => row.installmentNo },
    { key: "label", header: "Installment", width: "26%", render: (row) => row.label },
    { key: "due", header: "Due date", width: "18%", render: (row) => formatFullDate(row.dueDate) },
    { key: "amount", header: "Amount", numeric: true, width: "16%", render: (row) => formatINR(row.amount) },
    { key: "paid", header: "Paid", numeric: true, width: "16%", render: (row) => formatINR(row.amountPaid) },
    { key: "balance", header: "Balance", numeric: true, width: "18%", render: (row) => formatINR(row.balance) },
  ]

  const detailFields = [
    { label: "Invoice number", value: invoice.invoiceNumber },
    { label: "Status", value: INVOICE_STATUS_LABELS[invoice.status] },
    { label: "Generated on", value: formatFullDate(invoice.createdAt) },
    { label: "Student", value: invoice.student.fullName },
    { label: "Admission number", value: invoice.student.admissionNumber },
    { label: "Class", value: invoice.className },
    { label: "Section", value: invoice.sectionName ?? "—" },
    { label: "Session", value: `${invoice.session.name} (${invoice.session.code})` },
  ]

  return (
    <PrintDocument
      title="Fee Invoice"
      eyebrow="Invoice"
      subtitle={`${invoice.student.fullName} · ${invoice.student.admissionNumber}`}
      frame
      note={
        invoice.notes ??
        "All amounts shown are the net amounts recorded on this invoice. Payments are acknowledged separately on a fee receipt."
      }
    >
      <PrintSection title="Invoice details">
        <PrintFieldGrid fields={detailFields} columns={3} />
      </PrintSection>

      <PrintSection title="Fee breakdown">
        <PrintTable
          columns={itemColumns}
          rows={[...invoice.items].sort((a, b) => a.sortOrder - b.sortOrder)}
          rowKey={(item) => item.feeHeadId}
          emptyMessage="No fee heads on this invoice."
        />
      </PrintSection>

      <PrintTotals
        className="mt-5"
        variant="ledger"
        emphasisLabel="Total payable"
        items={[
          { label: "Total", value: formatINR(invoice.totalAmount) },
          { label: "Paid", value: formatINR(invoice.amountPaid) },
          { label: "Total payable", value: formatINR(invoice.balance) },
        ]}
      />

      {invoice.installments.length > 0 && (
        <PrintSection title="Payment schedule">
          <PrintTable
            compact
            columns={installmentColumns}
            rows={[...invoice.installments].sort((a, b) => a.installmentNo - b.installmentNo)}
            rowKey={(row) => row.id}
          />
        </PrintSection>
      )}

      <PrintSignatureRow entries={[{ role: "Parent / Guardian", name: null }, { role: "Accounts", name: null }]} />
    </PrintDocument>
  )
}
