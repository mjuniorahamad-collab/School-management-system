import { z } from "zod"
import { REPORT_KEYS } from "./report.catalog.js"
import type { ReportKey } from "./report.keys.js"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be formatted as YYYY-MM-DD")
const idSchema = z.string().trim().min(1).max(64)
const searchSchema = z.string().trim().min(1).max(100)

const ADMISSION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "CONVERTED"] as const
const INVOICE_STATUSES = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"] as const
const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"] as const

function pagination() {
  return {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
  }
}

export const reportKeyParamSchema = z.enum(REPORT_KEYS)

// Scope filters. Every report requires a sessionId and/or an explicit date
// range so no report can run as an unbounded whole-tenant scan.

export const studentRosterQuerySchema = z.object({
  ...pagination(),
  sessionId: z.string().trim().min(1).max(64),
  classId: optionalParam(idSchema),
  sectionId: optionalParam(idSchema),
  search: optionalParam(searchSchema),
})

export const admissionsSummaryQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  status: optionalParam(z.enum(ADMISSION_STATUSES)),
})

export const attendanceSummaryQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
  classId: optionalParam(idSchema),
  sectionId: optionalParam(idSchema),
  from: optionalParam(dateSchema),
  to: optionalParam(dateSchema),
})

export const feeCollectionQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
  classId: optionalParam(idSchema),
  status: optionalParam(z.enum(INVOICE_STATUSES)),
})

export const paymentRegisterQuerySchema = z.object({
  ...pagination(),
  from: dateSchema,
  to: dateSchema,
  method: optionalParam(z.enum(PAYMENT_METHODS)),
})

export const academicPerformanceQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
  examId: z.string().trim().min(1).max(64),
  classId: optionalParam(idSchema),
})

export const examOptionsQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
})

const QUERY_SCHEMAS = {
  "student-roster": studentRosterQuerySchema,
  "admissions-summary": admissionsSummaryQuerySchema,
  "attendance-summary": attendanceSummaryQuerySchema,
  "academic-performance": academicPerformanceQuerySchema,
  "fee-collection": feeCollectionQuerySchema,
  "payment-register": paymentRegisterQuerySchema,
} satisfies Record<ReportKey, z.ZodType>

export function reportQuerySchemaFor(key: ReportKey): z.ZodType {
  return QUERY_SCHEMAS[key]
}

export type StudentRosterQuery = z.infer<typeof studentRosterQuerySchema>
export type AdmissionsSummaryQuery = z.infer<typeof admissionsSummaryQuerySchema>
export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>
export type FeeCollectionQuery = z.infer<typeof feeCollectionQuerySchema>
export type PaymentRegisterQuery = z.infer<typeof paymentRegisterQuerySchema>
export type AcademicPerformanceQuery = z.infer<typeof academicPerformanceQuerySchema>
export type ExamOptionsQuery = z.infer<typeof examOptionsQuerySchema>
