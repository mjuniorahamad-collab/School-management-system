import { api } from "@/lib/apiClient"
import type {
  AcademicPerformanceQuery,
  AcademicPerformanceReport,
  AdmissionsSummaryQuery,
  AdmissionsSummaryReport,
  AttendanceSummaryQuery,
  AttendanceSummaryReport,
  FeeCollectionQuery,
  FeeCollectionReport,
  PaymentRegisterQuery,
  PaymentRegisterReport,
  ReportCatalogItem,
  ReportExamOption,
  StudentRosterQuery,
  StudentRosterReport,
} from "@/types/reports"

// Data seam for the Reports module. Every method hits the read-only REST API
// through the shared apiClient and returns the unwrapped envelope payload.

function setParam(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value === undefined || value === null || value === "") return
  params.set(key, String(value))
}

function toQueryString(record: object): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(record)) setParam(params, key, value)
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

// Export runs the same filters as the report view but ignores pagination on the
// server (fixed skip/take cap), so pagination fields are intentionally excluded.
export function buildReportExportUrl(key: string, record: object): string {
  return `/reports/${key}/export${toQueryString(record)}`
}

export const reportsService = {
  catalog(): Promise<ReportCatalogItem[]> {
    return api.get<ReportCatalogItem[]>("/reports")
  },

  listExamOptions(sessionId: string): Promise<ReportExamOption[]> {
    return api.get<ReportExamOption[]>(`/reports/exam-options?${new URLSearchParams({ sessionId }).toString()}`)
  },

  studentRoster(query: StudentRosterQuery): Promise<StudentRosterReport> {
    return api.get<StudentRosterReport>(`/reports/student-roster${toQueryString(query)}`)
  },

  admissionsSummary(query: AdmissionsSummaryQuery): Promise<AdmissionsSummaryReport> {
    return api.get<AdmissionsSummaryReport>(`/reports/admissions-summary${toQueryString(query)}`)
  },

  attendanceSummary(query: AttendanceSummaryQuery): Promise<AttendanceSummaryReport> {
    return api.get<AttendanceSummaryReport>(`/reports/attendance-summary${toQueryString(query)}`)
  },

  academicPerformance(query: AcademicPerformanceQuery): Promise<AcademicPerformanceReport> {
    return api.get<AcademicPerformanceReport>(`/reports/academic-performance${toQueryString(query)}`)
  },

  feeCollection(query: FeeCollectionQuery): Promise<FeeCollectionReport> {
    return api.get<FeeCollectionReport>(`/reports/fee-collection${toQueryString(query)}`)
  },

  paymentRegister(query: PaymentRegisterQuery): Promise<PaymentRegisterReport> {
    return api.get<PaymentRegisterReport>(`/reports/payment-register${toQueryString(query)}`)
  },
}