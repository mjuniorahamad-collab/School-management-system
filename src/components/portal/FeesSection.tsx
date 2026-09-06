import { formatFullDate, formatINR } from "@/lib/format"
import { usePortalFees } from "@/hooks/usePortal"
import { InvoiceStatusBadge } from "@/components/portal/PortalBadges"
import type { PortalInvoiceView, PortalInstallmentView } from "@/types/portal"

export function FeesSection({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = usePortalFees(studentId)

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }
  if (isError || !data) {
    return <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Could not load fee information.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{data.session.name}</span>
        <span>
          {data.student.name} · {data.student.admissionNumber}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-xs font-medium text-muted-foreground">Total billed</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatINR(data.totalAmount)}</p>
        </div>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-xs font-medium text-muted-foreground">Paid</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatINR(data.totalPaid)}</p>
        </div>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-xs font-medium text-muted-foreground">Balance due</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${data.totalBalance > 0 ? "text-destructive" : "text-foreground"}`}>
            {formatINR(data.totalBalance)}
          </p>
        </div>
      </div>

      {data.invoices.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No fee invoices for this session yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.invoices.map((invoice: PortalInvoiceView) => (
            <div key={invoice.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">{invoice.invoiceNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {invoice.className}
                    {invoice.sectionName ? ` · ${invoice.sectionName}` : ""}
                  </span>
                </div>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">Installment</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Due date</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Paid</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Balance</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoice.installments.map((installment: PortalInstallmentView) => (
                      <tr key={installment.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium text-foreground">{installment.label}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatFullDate(installment.dueDate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatINR(installment.amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{formatINR(installment.amountPaid)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{formatINR(installment.balance)}</td>
                        <td className="px-4 py-3"><InvoiceStatusBadge status={installment.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}