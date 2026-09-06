import { useQuery } from "@tanstack/react-query"
import { reportsService } from "@/services/reportsService"
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
  ReportExamOption,
  ReportKey,
  StudentRosterQuery,
  StudentRosterReport,
} from "@/types/reports"

const QUERY_KEYS = {
  catalog: () => ["reports", "catalog"] as const,
  examOptions: (sessionId: string) => ["reports", "exam-options", sessionId] as const,
  run: (key: ReportKey, query: unknown) => ["reports", "run", key, query] as const,
}

export function useReportCatalog() {
  return useQuery({
    queryKey: QUERY_KEYS.catalog(),
    queryFn: () => reportsService.catalog(),
    staleTime: 5 * 60_000,
  })
}

export function useReportExamOptions(sessionId: string | null): {
  data: ReportExamOption[] | undefined
  isPending: boolean
  isError: boolean
  refetch: () => void
} {
  const query = useQuery({
    queryKey: QUERY_KEYS.examOptions(sessionId ?? ""),
    queryFn: () => reportsService.listExamOptions(sessionId as string),
    enabled: Boolean(sessionId),
    staleTime: 30_000,
  })
  return {
    data: query.data,
    isPending: query.isPending,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

function useReportRun<Q, T>(key: ReportKey, query: Q | null, fetcher: (q: Q) => Promise<T>) {
  return useQuery({
    queryKey: QUERY_KEYS.run(key, query),
    queryFn: () => fetcher(query as Q),
    enabled: query !== null,
    placeholderData: (previous) => previous,
  })
}

// A null query disables the fetch; the caller only supplies a query once the
// report has been explicitly run with its required filters present.
export function useStudentRosterQuery(query: StudentRosterQuery | null) {
  return useReportRun("student-roster", query, reportsService.studentRoster)
}

export function useAdmissionsSummaryQuery(query: AdmissionsSummaryQuery | null) {
  return useReportRun("admissions-summary", query, reportsService.admissionsSummary)
}

export function useAttendanceSummaryQuery(query: AttendanceSummaryQuery | null) {
  return useReportRun("attendance-summary", query, reportsService.attendanceSummary)
}

export function useAcademicPerformanceQuery(query: AcademicPerformanceQuery | null) {
  return useReportRun("academic-performance", query, reportsService.academicPerformance)
}

export function useFeeCollectionQuery(query: FeeCollectionQuery | null) {
  return useReportRun("fee-collection", query, reportsService.feeCollection)
}

export function usePaymentRegisterQuery(query: PaymentRegisterQuery | null) {
  return useReportRun("payment-register", query, reportsService.paymentRegister)
}

export type {
  AcademicPerformanceReport,
  AdmissionsSummaryReport,
  AttendanceSummaryReport,
  FeeCollectionReport,
  PaymentRegisterReport,
  StudentRosterReport,
}