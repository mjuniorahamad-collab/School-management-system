import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { PaymentMethodLabel } from "@/components/fees/FeeStatusBadges"
import { useReceipt } from "@/hooks/useReceipts"
import { formatFullDate, formatINR } from "@/lib/format"
import type { ReceiptDetail } from "@/types/fees"

interface ReceiptDetailDialogProps {
  receiptId: string | null
  onOpenChange: (open: boolean) => void
}

export function ReceiptDetailDialog({ receiptId, onOpenChange }: ReceiptDetailDialogProps) {
  const { data, isPending, isError, refetch } = useReceipt(receiptId)

  return (
    <Dialog open={receiptId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {data?.receiptNumber ?? "Receipt"}
          </DialogTitle>
          <DialogDescription>Official record of this fee payment.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Could not load the receipt.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ReceiptContent receipt={data} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReceiptContent({ receipt }: { receipt: ReceiptDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <div>
          <p className="text-sm font-medium text-foreground">{receipt.student.fullName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{receipt.student.admissionNumber}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {receipt.className}
            {receipt.sectionName ? ` · ${receipt.sectionName}` : ""} · {receipt.sessionName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground uppercase">Amount received</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
            {formatINR(receipt.amount)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Detail label="Date" value={formatFullDate(receipt.receiptDate)} />
        <Detail label="Invoice" value={receipt.invoiceNumber} mono />
        <Detail label="Invoice total" value={formatINR(receipt.invoiceTotal)} />
        <Detail label="Payment method" value={<PaymentMethodLabel method={receipt.method} />} />
        <Detail label="Balance after" value={formatINR(receipt.balanceAfter)} />
        <Detail label="Received by" value={receipt.receivedByName ?? "—"} />
        {receipt.transactionRef && (
          <Detail label="Reference" value={receipt.transactionRef} />
        )}
        {receipt.payment && <Detail label="Payment" value={receipt.payment.paymentNumber} mono />}
      </dl>

      <p className="text-xs text-muted-foreground">
        Receipts are immutable — this record cannot be edited or deleted.
      </p>
    </div>
  )
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase">{label}</dt>
      <dd className={`mt-0.5 font-medium text-foreground ${mono ? "font-mono text-xs" : ""} tabular-nums`}>
        {typeof value === "string" ? value : value}
      </dd>
    </div>
  )
}