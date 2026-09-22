// Domain types for the Fee Concessions module. Mirrors the backend contract
// under server/src/modules/fee-adjustments/ (fee-adjustment.types.ts +
// fee-adjustment.schema.ts). Keep the two sides in sync when the API changes.

import type { Pagination } from "@/types/fees"

export const ADJUSTMENT_KINDS = ["FIXED_AMOUNT", "PERCENTAGE"] as const
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]

export const ADJUSTMENT_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED", "REVERSED"] as const
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number]

export const ADJUSTMENT_KIND_LABELS: Record<AdjustmentKind, string> = {
  FIXED_AMOUNT: "Fixed amount",
  PERCENTAGE: "Percentage",
}

export const ADJUSTMENT_STATUS_LABELS: Record<AdjustmentStatus, string> = {
  REQUESTED: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REVERSED: "Reversed",
}

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

/** How a concession reduced each installment (persisted server-side). */
export interface InstallmentApplicationLine {
  installmentId: string
  amountReduced: number
  amountBefore: number
  amountAfter: number
  balanceBefore: number
  balanceAfter: number
}

export interface AdjustmentListItem {
  id: string
  kind: AdjustmentKind
  value: number
  computedAmount: number
  status: AdjustmentStatus
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
  kind: AdjustmentKind
  value: number
  computedAmount: number
  status: AdjustmentStatus
  reason: string | null
  overridden: boolean
  overrideReason: string | null
  requestedBy: AdjustmentActorRef | null
  approvedBy: AdjustmentActorRef | null
  reversedBy: AdjustmentActorRef | null
  overriddenBy: AdjustmentActorRef | null
  reversalOf: {
    id: string
    kind: AdjustmentKind
    status: AdjustmentStatus
    computedAmount: number
  } | null
  installmentApplication: InstallmentApplicationLine[]
  student: AdjustmentStudentSummary
  session: { id: string; name: string } | null
  invoice: AdjustmentInvoiceSummary | null
  createdAt: string
  updatedAt: string
}

export interface AdjustmentListResult {
  items: AdjustmentListItem[]
  pagination: Pagination
}

export interface AdjustmentQuery {
  page?: number
  pageSize?: number
  sessionId?: string
  studentId?: string
  invoiceId?: string
  status?: AdjustmentStatus
  kind?: AdjustmentKind
  search?: string
  sortBy?: "createdAt" | "value" | "computedAmount" | "status"
  sortDir?: "asc" | "desc"
}

export interface RequestAdjustmentInput {
  invoiceId: string
  kind: AdjustmentKind
  value: number
  reason?: string
}

export interface OverrideAdjustmentInput {
  overrideReason: string
}

export interface AdjustActionInput {
  reason?: string
}