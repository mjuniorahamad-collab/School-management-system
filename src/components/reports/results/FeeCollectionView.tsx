import { formatINR, formatPercent, formatShortDate } from "@/lib/format"
import { ReportEmpty, ReportStatGrid, StatusBadge, TableShell } from "@/components/reports/shared"
import type { FeeCollectionReport } from "@/types/reports"

export function FeeCollectionView({ report }: { report: FeeCollectionReport }) {
  const { summary } = report
  return (
    <div className="flex flex-col gap-4">
      <ReportStatGrid
        stats={[
          { label: "Invoices", value: String(summary.invoiceCount), tone: "default" },
          { label: "Invoiced", value: formatINR(summary.invoiced), tone: "default" },
          { label: "Collected", value: formatINR(summary.collected), tone: "positive" },
          {
            label: "Outstanding",
            value: formatINR(summary.outstanding),
            tone: summary.outstanding > 0 ? "warning" : "positive",
          },
          { label: "Collection rate", value: formatPercent(summary.collectionRate, 1), tone: "default" },
        ]}
      />

      {report.items.length === 0 ? (
        <ReportEmpty message={`No fee invoices exist for this session.`} />
      ) : (
        <TableShell>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Class</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Invoiced</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Paid</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Balance</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Next due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.items.map((item) => (
                <tr key={item.invoiceId} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground tabular-nums">
                    {item.invoiceNumber}
                  </td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.studentName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{item.admissionNumber}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {item.className}
                    {item.sectionName ? ` · ${item.sectionName}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(item.totalAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(item.amountPaid)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatINR(item.balance)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {item.nextDueDate ? formatShortDate(item.nextDueDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  )
}