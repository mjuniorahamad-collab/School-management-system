import { rowsToCsv } from "../../lib/csv.js"
import type { ReportKey } from "./report.keys.js"
import type {
  AcademicPerformanceReport,
  AdmissionsSummaryReport,
  AttendanceSummaryReport,
  FeeCollectionReport,
  PaymentRegisterItem,
  ReportData,
  ReportRosterItem,
} from "./report.types.js"

// CSV serialization for report exports. Every export goes through the shared
// `rowsToCsv` utility (BOM + CRLF + RFC 4180-style quoting), so row/line breaks
// stay consistent with the students and audit-log exporters.

export function reportFileName(key: ReportKey, dateISO: string): string {
  return `${key}-${dateISO}.csv`
}

export function studentRosterToCsv(items: readonly ReportRosterItem[]): string {
  return rowsToCsv(
    [
      "Admission Number",
      "Student Name",
      "Class",
      "Section",
      "Gender",
      "Status",
      "Email",
      "Phone",
      "City",
      "State",
      "Admission Date",
    ],
    items.map((item) => [
      item.admissionNumber,
      item.name,
      item.className,
      item.sectionName ?? "",
      item.gender,
      item.status,
      item.email ?? "",
      item.phone ?? "",
      item.city ?? "",
      item.state ?? "",
      item.admissionDate,
    ]),
  )
}

export function admissionsSummaryToCsv(report: AdmissionsSummaryReport): string {
  return rowsToCsv(
    ["Month", "Total", "Converted", "Approved", "Rejected", "Withdrawn", "Pending"],
    report.items.map((bucket) => [
      bucket.month,
      bucket.total,
      bucket.statusCounts.CONVERTED ?? 0,
      bucket.statusCounts.APPROVED ?? 0,
      bucket.statusCounts.REJECTED ?? 0,
      bucket.statusCounts.WITHDRAWN ?? 0,
      bucket.statusCounts.PENDING ?? 0,
    ]),
  )
}

export function attendanceSummaryToCsv(report: AttendanceSummaryReport): string {
  return rowsToCsv(
    ["Scope", "Class", "Section", "Date", "Present", "Late", "Absent", "Holiday", "Total", "Present Rate (%)"],
    [
      ...report.classes.map((row) => [
        "Class",
        row.className,
        row.sectionName ?? "",
        "",
        row.present,
        row.late,
        row.absent,
        row.holiday,
        row.total,
        row.presentRate,
      ]),
      ...report.daily.map((row) => [
        "Daily",
        "",
        "",
        row.date,
        row.present,
        row.late,
        row.absent,
        row.holiday,
        row.total,
        row.presentRate,
      ]),
    ],
  )
}

export function academicPerformanceToCsv(report: AcademicPerformanceReport): string {
  return rowsToCsv(
    ["Rank", "Admission Number", "Student Name", "Class", "Section", "Total Obtained", "Total Max Marks", "Percentage", "Grade", "Pass"],
    report.items.map((item) => [
      item.rank ?? "",
      item.admissionNumber,
      item.studentName,
      item.className,
      item.sectionName ?? "",
      item.totalObtained !== null ? item.totalObtained.toFixed(2) : "",
      item.totalMaxMarks !== null ? item.totalMaxMarks.toFixed(2) : "",
      item.totalPercentage !== null ? item.totalPercentage.toFixed(2) : "",
      item.grade ?? "",
      item.isPass === null ? "" : item.isPass ? "YES" : "NO",
    ]),
  )
}

export function feeCollectionToCsv(report: FeeCollectionReport): string {
  return rowsToCsv(
    ["Invoice Number", "Student", "Admission Number", "Class", "Section", "Session", "Total", "Paid", "Balance", "Status", "Next Due Date"],
    report.items.map((item) => [
      item.invoiceNumber,
      item.studentName,
      item.admissionNumber,
      item.className,
      item.sectionName ?? "",
      item.sessionName,
      item.totalAmount.toFixed(2),
      item.amountPaid.toFixed(2),
      item.balance.toFixed(2),
      item.status,
      item.nextDueDate ?? "",
    ]),
  )
}

export function paymentRegisterToCsv(items: readonly PaymentRegisterItem[]): string {
  return rowsToCsv(
    ["Receipt Number", "Date", "Student", "Admission Number", "Invoice Number", "Class", "Section", "Session", "Method", "Amount", "Balance After", "Transaction Ref"],
    items.map((item) => [
      item.receiptNumber,
      item.paymentDate,
      item.studentName,
      item.admissionNumber,
      item.invoiceNumber,
      item.className,
      item.sectionName ?? "",
      item.sessionName,
      item.method,
      item.amount.toFixed(2),
      item.balanceAfter.toFixed(2),
      item.transactionRef ?? "",
    ]),
  )
}

/** Serializes a full (non-paginated) report payload for export. */
export function reportToCsv(key: ReportKey, data: ReportData): string {
  switch (key) {
    case "admissions-summary":
      return admissionsSummaryToCsv(data as AdmissionsSummaryReport)
    case "attendance-summary":
      return attendanceSummaryToCsv(data as AttendanceSummaryReport)
    case "academic-performance":
      return academicPerformanceToCsv(data as AcademicPerformanceReport)
    case "fee-collection":
      return feeCollectionToCsv(data as FeeCollectionReport)
    default:
      // Windowed exports (roster, payment register) never pass through here.
      throw new Error(`Report "${key}" has no full-serialization export path`)
  }
}