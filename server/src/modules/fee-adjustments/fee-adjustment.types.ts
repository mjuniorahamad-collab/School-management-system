import type { FeeAdjustmentKind, FeeAdjustmentStatus } from "@prisma/client"
import type { InstallmentApplicationLine } from "./fee-adjustment.rules.js"

export interface AdjustmentStudentSummary {
  id: string
  admissionNumber: string
  fullName: string
}

export interface AdjustmentInvoiceSummary {
  id: string
  invoiceNumber: string
  grossAmount: number
  totalAmount: number
  amountPaid: number
  balance: number
  status: string
  className: string
  sectionName: string | null
  sessionName: string
  student: AdjustmentStudentSummary
}

export interface AdjustmentActorRef {
  id: string
  name: string
}

export interface AdjustmentItem {
  id: string
  kind: FeeAdjustmentKind
  value: number
  computedAmount: number
  status: FeeAdjustmentStatus
  reason: string | null
  overridden: boolean
  overrideReason: string | null
  requestedBy: AdjustmentActorRef | null
  invoice: {
    id: string
    invoiceNumber: string
    student: AdjustmentStudentSummary
  }
  createdAt: string
}

export interface AdjustmentDetail {
  id: string
  kind: FeeAdjustmentKind
  value: number
  computedAmount: number
  status: FeeAdjustmentStatus
  reason: string | null
  overridden: boolean
  overrideReason: string | null
  requestedBy: AdjustmentActorRef | null
  approvedBy: AdjustmentActorRef | null
  reversedBy: AdjustmentActorRef | null
  overriddenBy: AdjustmentActorRef | null
  reversalOf: {
    id: string
    kind: FeeAdjustmentKind
    status: FeeAdjustmentStatus
    computedAmount: number
  } | null
  installmentApplication: InstallmentApplicationLine[]
  student: AdjustmentStudentSummary
  session: { id: string; name: string } | null
  invoice: AdjustmentInvoiceSummary | null
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AdjustmentListResult {
  items: AdjustmentItem[]
  pagination: Pagination
}