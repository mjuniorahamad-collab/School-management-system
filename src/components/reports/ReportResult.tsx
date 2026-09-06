import { Download, Printer } from "lucide-react"
import { API_BASE_URL } from "@/lib/apiClient"
import { Button } from "@/components/ui/button"
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
          <Button variant="outline" onClick={() => window.print()} className="shrink-0">
            <Printer className="size-4" aria-hidden="true" />
            Print
          </Button>
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

      {isPending ? (
        <ReportSkeleton />
      ) : isError ? (
        <ReportError onRetry={onRetry} />
      ) : data ? (
        <ReportBody report={report} data={data} page={page} totalPages={totalPages} onPageChange={onPageChange} />
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