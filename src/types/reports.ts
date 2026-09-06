// Domain types for the Reports module. Mirrors the backend contract
// (server/src/modules/reports/report.{keys,types,schema}.ts). Keep these in
// sync whenever the report catalog, query params, or a result shape changes.

export type ReportGroup = "operational" | "academic" | "financial"

export type ReportKey =
  | "student-roster"
  | "admissions-summary"
  | "attendance-summary"
  | "academic-performance"
  | "fee-collection"
  | "payment-register"

export const REPORT_KEYS = [
  "student-roster",
  "admissions-summary",
  "attendance-summary",
  "academic-performance",
  "fee-collection",
  "payment-register",
] as const satisfies readonly ReportKey[]

export function isReportKey(value: string | null | undefined): value is ReportKey {
  return typeof value === "string" && (REPORT_KEYS as readonly string[]).includes(value)
}

export interface ReportCatalogItem {
  key: string
  title: string
  group: ReportGroup
  description: string
}

// ─── Student Roster ─────────────────────────────────────────────────────────

export interface ReportRosterItem {
  studentId: string
  admissionNumber: string
  name: string
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  gender: string
  status: string
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  admissionDate: string
}

export interface ReportClassCount {
  classId: string
  className: string
  count: number
}

export interface StudentRosterReport {
  session: { id: string; name: string }
  summary: { total: number; classBreakdown: ReportClassCount[] }
  items: ReportRosterItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

// ─── Admissions Summary ─────────────────────────────────────────────────────

export interface AdmissionsMonthlyBucket {
  month: string
  total: number
  statusCounts: Record<string, number>
}

export interface AdmissionsSummaryReport {
  summary: {
    from: string
    to: string
    total: number
    converted: number
    conversionRate: number
    statusCounts: Record<string, number>
  }
  items: AdmissionsMonthlyBucket[]
}

// ─── Attendance Summary ─────────────────────────────────────────────────────

export interface AttendanceTotals {
  present: number
  late: number
  absent: number
  holiday: number
  total: number
  presentRate: number
}

export interface AttendanceClassRow extends AttendanceTotals {
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
}

export interface AttendanceDailyRow extends AttendanceTotals {
  date: string
}

export interface AttendanceSummaryReport {
  session: { id: string; name: string }
  from: string
  to: string
  summary: AttendanceTotals
  classes: AttendanceClassRow[]
  daily: AttendanceDailyRow[]
}

// ─── Academic Performance ───────────────────────────────────────────────────

export interface AcademicSubjectSummary {
  examSubjectId: string
  subjectName: string
  subjectCode: string
  maxMarks: number
  passMarks: number
  attemptedMarks: number
  averagePercentage: number | null
}

export interface AcademicPerformanceItem {
  studentId: string
  admissionNumber: string
  studentName: string
  className: string
  sectionName: string | null
  rank: number | null
  totalObtained: number | null
  totalMaxMarks: number | null
  totalPercentage: number | null
  grade: string | null
  isPass: boolean | null
}

export interface AcademicClassSummary {
  rank: number
  className: string
  performance: number
  students: number
}

export interface AcademicPerformanceReport {
  exam: {
    id: string
    name: string
    status: string
    examTypeName: string
    className: string
    sectionName: string | null
    publishedAt: string | null
    finalizedAt: string | null
  }
  summary: {
    students: number
    completeStudents: number
    averagePercentage: number | null
    passCount: number
    passRate: number | null
    subjects: AcademicSubjectSummary[]
  }
  classes: AcademicClassSummary[]
  items: AcademicPerformanceItem[]
}

// ─── Fee Collection & Outstanding ───────────────────────────────────────────

export interface FeeCollectionItem {
  invoiceId: string
  invoiceNumber: string
  studentId: string
  studentName: string
  admissionNumber: string
  className: string
  sectionName: string | null
  sessionName: string
  totalAmount: number
  amountPaid: number
  balance: number
  status: string
  nextDueDate: string | null
}

export interface FeeCollectionReport {
  session: { id: string; name: string }
  summary: {
    invoiceCount: number
    invoiced: number
    collected: number
    outstanding: number
    collectionRate: number
  }
  items: FeeCollectionItem[]
}

// ─── Payment & Receipt Register ─────────────────────────────────────────────

export interface PaymentRegisterItem {
  receiptId: string
  receiptNumber: string
  paymentDate: string
  studentName: string
  admissionNumber: string
  invoiceNumber: string
  className: string
  sectionName: string | null
  sessionName: string
  method: string
  amount: number
  balanceAfter: number
  transactionRef: string | null
}

export interface PaymentRegisterReport {
  summary: {
    from: string
    to: string
    count: number
    totalAmount: number
    methodCounts: Record<string, number>
  }
  items: PaymentRegisterItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ReportData =
  | StudentRosterReport
  | AdmissionsSummaryReport
  | AttendanceSummaryReport
  | AcademicPerformanceReport
  | FeeCollectionReport
  | PaymentRegisterReport

// ─── Exam options ───────────────────────────────────────────────────────────

export interface ReportExamOption {
  id: string
  name: string
  status: string
  examTypeName: string
  className: string
  sectionName: string | null
  subjectCount: number
  publishedAt: string | null
  finalizedAt: string | null
}

// ─── Query / filter shapes ──────────────────────────────────────────────────

export interface StudentRosterQuery {
  page: number
  pageSize: number
  sessionId: string
  classId?: string
  sectionId?: string
  search?: string
}

export interface AdmissionsSummaryQuery {
  from: string
  to: string
  status?: string
}

export interface AttendanceSummaryQuery {
  sessionId: string
  classId?: string
  sectionId?: string
  from?: string
  to?: string
}

export interface FeeCollectionQuery {
  sessionId: string
  classId?: string
  status?: string
}

export interface PaymentRegisterQuery {
  page: number
  pageSize: number
  from: string
  to: string
  method?: string
}

export interface AcademicPerformanceQuery {
  sessionId: string
  examId: string
  classId?: string
}

export interface ExamOptionsQuery {
  sessionId: string
}

// Draft filter values per report (no pagination — that is separate page state).
export interface StudentRosterFilters {
  sessionId: string
  classId: string
  sectionId: string
  search: string
}

export interface AdmissionsSummaryFilters {
  from: string
  to: string
  status: string
}

export interface AttendanceSummaryFilters {
  sessionId: string
  classId: string
  sectionId: string
  from: string
  to: string
}

export interface FeeCollectionFilters {
  sessionId: string
  classId: string
  status: string
}

export interface PaymentRegisterFilters {
  from: string
  to: string
  method: string
}

export interface AcademicPerformanceFilters {
  sessionId: string
  examId: string
  classId: string
}

export interface ReportFiltersByKey {
  "student-roster": StudentRosterFilters
  "admissions-summary": AdmissionsSummaryFilters
  "attendance-summary": AttendanceSummaryFilters
  "academic-performance": AcademicPerformanceFilters
  "fee-collection": FeeCollectionFilters
  "payment-register": PaymentRegisterFilters
}

export const ADMISSION_STATUS_OPTIONS = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "CONVERTED"] as const
export const INVOICE_STATUS_OPTIONS = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"] as const
export const PAYMENT_METHOD_OPTIONS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"] as const