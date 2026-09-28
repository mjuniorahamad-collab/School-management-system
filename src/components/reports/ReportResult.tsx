import { Download } from "lucide-react"
import { API_BASE_URL } from "@/lib/apiClient"
import { Button } from "@/components/ui/button"
import { PrintButton } from "@/components/print/PrintButton"
import { ReportPrintFrame } from "@/components/reports/ReportPrintFrame"
import { ReportEmpty, ReportError, ReportSkeleton } from "@/components/reports/shared"
import { AcademicPerformanceView } from "@/components/reports/results/AcademicPerformanceView"
import { AdmissionsSummaryView } from "@/components/reports/results/AdmissionsSummaryView"
import { AttendanceSummaryView } from "@/components/reports/results/AttendanceSummaryView"
import { FeeCollectionView } from "@/components/reports/results/FeeCollectionView"
import { PaymentRegisterView } from "@/components/reports/results/PaymentRegisterView"
import { StudentRosterView } from "@/components/reports/results/StudentRosterView"
import type {
  AcademicPerformanceReport,
  AdmissionsSummaryReport,
  AttendanceSummaryReport,
  FeeCollectionReport,
  PaymentRegisterReport,
  ReportCatalogItem,
  ReportData,
  StudentRosterReport,
} from "@/types/reports"

interface ReportResultProps {
  report: ReportCatalogItem
  data: ReportData | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  canExport: boolean
  /** Printing is gated on the report's read permission (decision D1). */
  canPrint: boolean
  exportHref: string | null
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function ReportResult({
  report,
  data,
  isPending,
  isError,
  onRetry,
  canExport,
  canPrint,
  exportHref,
  page,
  totalPages,
  onPageChange,
}: ReportResultProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="max-w-2xl text-sm text-muted-foreground">{report.description}</p>
        <div className="flex shrink-0 items-center gap-2">
          {canPrint && (
            <PrintButton documentTitle={report.title}>Print</PrintButton>
          )}
          {canExport && exportHref && (
            <Button variant="outline" asChild className="shrink-0">
              <a href={`${API_BASE_URL}${exportHref}`} download>
                <Download className="size-4" aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* The print frame supplies the letterhead, title block, scope and repeating
          footer, and the report body is the printed content itself — so the frame
          only ever wraps a real result, never the empty or error states below. */}
      {isPending ? (
        <ReportSkeleton />
      ) : isError ? (
        <ReportError onRetry={onRetry} />
      ) : data ? (
        <ReportPrintFrame report={report} data={data} page={page} totalPages={totalPages}>
          <ReportBody
            report={report}
            data={data}
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </ReportPrintFrame>
      ) : (
        <ReportEmpty message="Choose a report and run it to see results here." />
      )}
    </div>
  )
}

function ReportBody({
  report,
  data,
  page,
  totalPages,
  onPageChange,
}: {
  report: ReportCatalogItem
  data: ReportData
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  switch (report.key) {
    case "student-roster":
      return (
        <StudentRosterView
          report={data as StudentRosterReport}
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )
    case "admissions-summary":
      return <AdmissionsSummaryView report={data as AdmissionsSummaryReport} />
    case "attendance-summary":
      return <AttendanceSummaryView report={data as AttendanceSummaryReport} />
    case "academic-performance":
      return <AcademicPerformanceView report={data as AcademicPerformanceReport} />
    case "fee-collection":
      return <FeeCollectionView report={data as FeeCollectionReport} />
    case "payment-register":
      return (
        <PaymentRegisterView
          report={data as PaymentRegisterReport}
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )
    default:
      return null
  }
}