import { formatPercent } from "@/lib/format"
import { ReportEmpty, ReportStatGrid, TableShell } from "@/components/reports/shared"
import type { AdmissionsSummaryReport } from "@/types/reports"

const STATUS_COLUMNS = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "CONVERTED"] as const

export function AdmissionsSummaryView({ report }: { report: AdmissionsSummaryReport }) {
  const { total, converted, conversionRate, statusCounts } = report.summary
  return (
    <div className="flex flex-col gap-4">
      <ReportStatGrid
        stats={[
          { label: "Applications", value: String(total), tone: "default" },
          { label: "Converted", value: String(converted), tone: "positive" },
          { label: "Conversion rate", value: formatPercent(conversionRate, 1), tone: "default" },
          { label: "Pending", value: String(statusCounts.PENDING ?? 0), tone: "warning" },
        ]}
      />

      {report.items.length === 0 ? (
        <ReportEmpty message="No admission applications were submitted in this range." />
      ) : (
        <TableShell>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Month</th>
                {STATUS_COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 text-right font-medium">
                    {column.charAt(0) + column.slice(1).toLowerCase()}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.items.map((bucket) => (
                <tr key={bucket.month} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium text-foreground">{bucket.month}</td>
                  {STATUS_COLUMNS.map((column) => (
                    <td key={column} className="px-4 py-3 text-right tabular-nums">
                      {bucket.statusCounts[column] ?? 0}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{bucket.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  )
}