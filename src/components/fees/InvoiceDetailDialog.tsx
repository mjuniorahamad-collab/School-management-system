import { InstallmentStatusBadge } from "@/components/fees/FeeStatusBadges"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useFeeInvoice } from "@/hooks/useFeeInvoices"
import { formatFullDate, formatINR } from "@/lib/format"
import type { FeeInvoiceDetail } from "@/types/fees"

interface InvoiceDetailDialogProps {
  invoiceId: string | null
  onOpenChange: (open: boolean) => void
}

export function InvoiceDetailDialog({ invoiceId, onOpenChange }: InvoiceDetailDialogProps) {
  const { data, isPending, isError, refetch } = useFeeInvoice(invoiceId)

  return (
    <Dialog open={invoiceId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {data?.invoiceNumber ?? "Invoice"}
          </DialogTitle>
          <DialogDescription>Payment schedule and fee breakdown for this invoice.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Could not load the invoice.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <InvoiceContent invoice={data} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InvoiceContent({ invoice }: { invoice: FeeInvoiceDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10 sm:grid-cols-4">
        <MetaCard label="Student" value={invoice.student.fullName} />
        <MetaCard label="Admission" value={invoice.student.admissionNumber} />
        <MetaCard label="Class" value={invoice.className + (invoice.sectionName ? ` · ${invoice.sectionName}` : "")} />
        <MetaCard label="Session" value={invoice.session.name} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <AmountCard label="Total" value={formatINR(invoice.totalAmount)} />
        <AmountCard label="Paid" value={formatINR(invoice.amountPaid)} tone="emerald" />
        <AmountCard label="Balance" value={formatINR(invoice.balance)} tone={invoice.balance > 0 ? "amber" : "slate"} />
      </div>

      <DetailSection title="Fee items">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y">
            {invoice.items.map((item) => (
              <tr key={item.feeHeadId + item.sortOrder}>
                <td className="py-2 text-foreground">{item.feeHeadName}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{formatINR(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailSection>

      <DetailSection title="Installments">
        <table className="w-full text-left text-sm">
          <thead className="text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="py-2 text-left font-medium">#</th>
              <th scope="col" className="py-2 text-left font-medium">Label</th>
              <th scope="col" className="py-2 text-left font-medium">Due date</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
              <th scope="col" className="py-2 text-right font-medium">Paid</th>
              <th scope="col" className="py-2 text-right font-medium">Balance</th>
              <th scope="col" className="py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoice.installments.map((installment) => (
              <tr key={installment.id}>
                <td className="py-2 text-muted-foreground tabular-nums">{installment.installmentNo}</td>
                <td className="py-2 text-foreground">{installment.label}</td>
                <td className="py-2 text-muted-foreground tabular-nums">{formatFullDate(installment.dueDate)}</td>
                <td className="py-2 text-right tabular-nums">{formatINR(installment.amount)}</td>
                <td className="py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatINR(installment.amountPaid)}
                </td>
                <td className="py-2 text-right font-medium tabular-nums">{formatINR(installment.balance)}</td>
                <td className="py-2">
                  <InstallmentStatusBadge status={installment.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailSection>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 truncate font-medium text-foreground">{value}</p>
    </div>
  )
}

function AmountCard({
  label,
  value,
  tone = "slate",
}: {
  label: string
  value: string
  tone?: "slate" | "emerald" | "amber"
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "text-foreground"
  return (
    <div className="rounded-lg bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}