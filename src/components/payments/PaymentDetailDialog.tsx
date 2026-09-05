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
import { usePayment } from "@/hooks/usePayments"
import { formatFullDate, formatINR } from "@/lib/format"
import type { InvoiceStatus, PaymentDetail } from "@/types/fees"

interface PaymentDetailDialogProps {
  paymentId: string | null
  onOpenChange: (open: boolean) => void
}

export function PaymentDetailDialog({ paymentId, onOpenChange }: PaymentDetailDialogProps) {
  const { data, isPending, isError, refetch } = usePayment(paymentId)

  return (
    <Dialog open={paymentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {data?.paymentNumber ?? "Payment"}
          </DialogTitle>
          <DialogDescription>Full record of this fee payment and its receipt.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Could not load the payment.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <PaymentContent payment={data} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PaymentContent({ payment }: { payment: PaymentDetail }) {
  return (
    <div className="flex flex-col gap-4">
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

      <SectionCard title="Receipt">
        {payment.receipt ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-sm text-foreground">{payment.receipt.receiptNumber}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Balance after this payment: {formatINR(payment.receipt.balanceAfter)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No receipt was issued for this payment.</p>
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