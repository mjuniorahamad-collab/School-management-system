import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { InvoiceStatusBadge, PaymentMethodLabel, PaymentStatusBadge } from "@/components/fees/FeeStatusBadges"
import { PaymentReceiptPrint } from "@/components/payments/PaymentReceiptPrint"
import { ReceiptPrintDocument } from "@/components/receipts/ReceiptPrintDocument"
import { usePayment } from "@/hooks/usePayments"
import { formatFullDate, formatINR } from "@/lib/format"
import type { InvoiceStatus, PaymentDetail, ReceiptDetail } from "@/types/fees"

interface PaymentDetailDialogProps {
  paymentId: string | null
  onOpenChange: (open: boolean) => void
}

export function PaymentDetailDialog({ paymentId, onOpenChange }: PaymentDetailDialogProps) {
  const { data, isPending, isError, refetch } = usePayment(paymentId)
  const [printReceipt, setPrintReceipt] = useState<ReceiptDetail | null>(null)

  const onReceiptLoaded = useCallback((receipt: ReceiptDetail) => {
    setPrintReceipt(receipt)
  }, [])

  return (
    <Dialog open={paymentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="print:hidden">
          <DialogTitle className="font-mono text-base">
            {data?.paymentNumber ?? "Payment"}
          </DialogTitle>
          <DialogDescription>Full record of this fee payment and its receipt.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-3 print:hidden">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center print:hidden">
            <p className="text-sm text-muted-foreground">Could not load the payment.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <PaymentContent payment={data} onReceiptLoaded={onReceiptLoaded} />
        )}

        {/* The print document lives inside the dialog so the print stylesheet can
            un-fix it, and it is a direct child of DialogContent — never nested in
            a screen card or flex row, which would make it a flex item sized by its
            own content rather than by the page box. It is `hidden print:block`, so
            it never appears on screen. The receiptId guard keeps a receipt loaded
            for a previously viewed payment from ever reaching the print region. */}
        {printReceipt !== null && printReceipt.id === data?.receipt?.id && (
          <ReceiptPrintDocument receipt={printReceipt} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PaymentContent({
  payment,
  onReceiptLoaded,
}: {
  payment: PaymentDetail
  onReceiptLoaded: (receipt: ReceiptDetail) => void
}) {
  return (
    /* All of this is screen chrome. The receipt print document is mounted by the
       dialog itself as a direct child of DialogContent, so this whole block can
       simply be hidden from the sheet. */
    <div className="flex flex-col gap-4 print:hidden">
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10 sm:grid-cols-4">
        <MetaCard label="Amount" value={formatINR(payment.amount)} />
        <MetaCard label="Date" value={formatFullDate(payment.paymentDate)} />
        <MetaCard label="Method" value={<PaymentMethodLabel method={payment.method} />} />
        <MetaCard label="Status" value={<PaymentStatusBadge status={payment.status} />} />
      </div>

      {payment.transactionRef && (
        <SectionCard title="Reference">
          <p className="text-sm text-foreground">{payment.transactionRef}</p>
        </SectionCard>
      )}
      {payment.notes && (
        <SectionCard title="Notes">
          <p className="text-sm text-foreground">{payment.notes}</p>
        </SectionCard>
      )}

      <SectionCard title="Invoice">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-sm text-foreground">{payment.invoice.invoiceNumber}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {payment.invoice.student.fullName} · {payment.invoice.student.admissionNumber}
            </p>
          </div>
          <InvoiceStatusBadge status={payment.invoice.status as InvoiceStatus} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <dt className="text-xs font-medium text-muted-foreground uppercase">Total</dt>
          <dd className="tabular-nums text-foreground">{formatINR(payment.invoice.totalAmount)}</dd>
          <dd />
          <dt className="text-xs font-medium text-muted-foreground uppercase">Paid to date</dt>
          <dd className="tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatINR(payment.invoice.amountPaid)}
          </dd>
          <dd />
          <dt className="text-xs font-medium text-muted-foreground uppercase">Balance</dt>
          <dd className="tabular-nums text-foreground">{formatINR(payment.invoice.balance)}</dd>
          <dd />
        </dl>
      </SectionCard>

      {/* Trigger only. It hands the loaded receipt back to the dialog, which owns
          the document — see PaymentReceiptPrint. */}
      <SectionCard title="Receipt">
        {payment.receipt ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-sm text-foreground">{payment.receipt.receiptNumber}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Balance after this payment: {formatINR(payment.receipt.balanceAfter)}
              </p>
            </div>
            <PaymentReceiptPrint
              receiptId={payment.receipt.id}
              onLoaded={onReceiptLoaded}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No receipt was issued for this payment.
          </p>
        )}
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Recorded {payment.recordedBy ? `by ${payment.recordedBy.name}` : "automatically"} on{" "}
        {formatFullDate(payment.createdAt)}.
      </p>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <div className="mt-0.5">{typeof value === "string" ? <p className="font-medium text-foreground">{value}</p> : value}</div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}
