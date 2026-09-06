import type { PermissionCode } from "../../permissions/permissions.js"
import type { ReportKey } from "./report.keys.js"

// The single source of truth for the Reports V1 catalog. The frontend mirrors
// this registry through `GET /reports/catalog` so the report UI is data-driven.
// `requiredPermission` is an ANY-semantics list of existing permission codes
// enforced server-side with the same `hasPermission` primitive as every other
// route guard — a finance/academic report can never be reached through a future
// loose role grant.

export interface ReportDefinition {
  key: ReportKey
  title: string
  group: "operational" | "academic" | "financial"
  description: string
  requiredPermission: PermissionCode[]
}

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    key: "student-roster",
    title: "Student Roster",
    group: "operational",
    description: "Students enrolled in an academic session, with their class and section placement.",
    requiredPermission: ["students:view"],
  },
  {
    key: "admissions-summary",
    title: "Admissions Summary",
    group: "operational",
    description: "Admission applications by status and month over a date range, with conversion rate.",
    requiredPermission: ["admissions:view"],
  },
  {
    key: "attendance-summary",
    title: "Attendance Summary",
    group: "operational",
    description: "Present, late, absent and holiday counts per class, with daily totals for the period.",
    requiredPermission: ["attendance:view"],
  },
  {
    key: "academic-performance",
    title: "Academic Performance",
    group: "academic",
    description: "Per-student and per-class performance for a single exam (one exam context at a time).",
    requiredPermission: ["results:view"],
  },
  {
    key: "fee-collection",
    title: "Fee Collection & Outstanding",
    group: "financial",
    description: "Invoiced, collected and outstanding fee balances per session, derived from canonical invoice data.",
    requiredPermission: ["fees:view"],
  },
  {
    key: "payment-register",
    title: "Payment & Receipt Register",
    group: "financial",
    description: "Every recorded fee payment and its immutable receipt over a date range.",
    requiredPermission: ["payments:view", "receipts:view"],
  },
]

const REPORT_MAP = new Map<string, ReportDefinition>(REPORT_CATALOG.map((definition) => [definition.key, definition]))

export function getReportDefinition(key: string): ReportDefinition | undefined {
  return REPORT_MAP.get(key)
}

export const REPORT_KEYS = REPORT_CATALOG.map((definition) => definition.key) as [ReportKey, ...ReportKey[]]