import { PrintDocument } from "@/components/print/PrintDocument"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintSignatureRow } from "@/components/print/PrintSignatures"
import { PrintTotals } from "@/components/print/PrintTotals"
import { formatAmountInWords, formatFullDate, formatINR } from "@/lib/format"
import { PAYMENT_METHOD_LABELS, type ReceiptDetail } from "@/types/fees"

/**
 * The printed fee receipt.
 *
 * Rendered from the `ReceiptDetail` DTO only. It prints the values the API
 * returned — including the balance after this receipt — and never recomputes
 * money, so the paper copy cannot disagree with the record it came from.
 *
 * Structure: identity block → the money (a headline strip) → the same money in
 * words → how it was paid → who took it. A receipt is short, so it carries the
 * document frame; a register would not.
 *
 * Shared by the Receipt dialog and the Payment detail dialog, which prints the
 * same artifact (decision D1: gated on `receipts:view`).
 */
export function ReceiptPrintDocument({ receipt }: { receipt: ReceiptDetail }) {
  const detailFields = [
    { label: "Receipt number", value: receipt.receiptNumber },
    { label: "Receipt date", value: formatFullDate(receipt.receiptDate) },
    { label: "Session", value: `${receipt.sessionName} ${receipt.sessionYear}` },
    { label: "Student", value: receipt.student.fullName },
    { label: "Admission number", value: receipt.student.admissionNumber },
    { label: "Class", value: receipt.className },
    { label: "Section", value: receipt.sectionName ?? "—" },
    { label: "Invoice number", value: receipt.invoiceNumber },
    { label: "Payment number", value: receipt.payment?.paymentNumber ?? "—" },
  ]

  const paymentFields = [
    { label: "Payment method", value: PAYMENT_METHOD_LABELS[receipt.method] },
    { label: "Transaction reference", value: receipt.transactionRef ?? "Not provided" },
  ]

  return (
    <PrintDocument
      title="Fee Receipt"
      eyebrow="Receipt"
      subtitle={`${receipt.student.fullName} · ${receipt.student.admissionNumber}`}
      frame
      note={`This receipt records the payment above against invoice ${receipt.invoiceNumber} and is an immutable record of it. It does not itemise individual fee heads — the breakdown is held on invoice ${receipt.invoiceNumber}.`}
    >
      <PrintSection title="Receipt details">
        <PrintFieldGrid fields={detailFields} columns={3} />
      </PrintSection>

      <PrintTotals
        className="mt-5"
        items={[
          { label: "Invoice total", value: formatINR(receipt.invoiceTotal) },
          {
            label: "Amount received",
            value: formatINR(receipt.amount),
            emphasis: true,
            hint: formatFullDate(receipt.receiptDate),
          },
          {
            label: "Balance after",
            value: formatINR(receipt.balanceAfter),
            hint: receipt.balanceAfter === 0 ? "Fully paid" : "Outstanding on this invoice",
          },
        ]}
      />

      <PrintSection title="Amount in words">
        <p className="print-document-value">{formatAmountInWords(receipt.amount)}</p>
      </PrintSection>

      <PrintSection title="Payment details">
        <PrintFieldGrid fields={paymentFields} columns={2} />
      </PrintSection>

      <PrintSignatureRow
        stamp
        entries={[
          { role: "Received by", name: receipt.receivedByName },
          { role: "Verified by", name: null },
        ]}
      />
    </PrintDocument>
  )
}
