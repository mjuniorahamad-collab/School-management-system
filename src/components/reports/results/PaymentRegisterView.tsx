import { formatINR, formatShortDate } from "@/lib/format"
import {
  humanizeToken,
  ReportEmpty,
  ReportStatGrid,
  ResultsPagination,
  TableShell,
} from "@/components/reports/shared"
import type { PaymentRegisterReport } from "@/types/reports"

interface PaymentRegisterViewProps {
  report: PaymentRegisterReport
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function PaymentRegisterView({ report, page, totalPages, onPageChange }: PaymentRegisterViewProps) {
  const methodChips = Object.entries(report.summary.methodCounts)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ReportStatGrid
          stats={[
            { label: "Payments", value: String(report.summary.count), tone: "default" },
            { label: "Total collected", value: formatINR(report.summary.totalAmount), tone: "positive" },
          ]}
        />
        {methodChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {methodChips.map(([method, count]) => (
              <span
                key={method}
                className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
              >
                {humanizeToken(method)}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {report.items.length === 0 ? (
        <ReportEmpty message="No payments were recorded in this date range." />
      ) : (
        <>
          <TableShell>
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Receipt</th>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Student</th>
                  <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-3 font-medium">Class</th>
                  <th scope="col" className="px-4 py-3 font-medium">Method</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Balance after</th>
                  <th scope="col" className="px-4 py-3 font-medium">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.items.map((item) => (
                  <tr key={item.receiptId} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground tabular-nums">
                      {item.receiptNumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatShortDate(item.paymentDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{item.studentName}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{item.admissionNumber}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {item.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {item.className}
                      {item.sectionName ? ` · ${item.sectionName}` : ""}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {humanizeToken(item.method)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatINR(item.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(item.balanceAfter)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {item.transactionRef ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          <ResultsPagination page={page} totalPages={totalPages} total={report.pagination.total} onPageChange={onPageChange} />
        </>
      )}
    </div>
  )
}