import { Prisma } from "@prisma/client"
import { toMoney } from "../../lib/money.js"
import type { InstallmentApplicationLine } from "./fee-adjustment.rules.js"
import type {
  AdjustmentActorRef,
  AdjustmentDetail,
  AdjustmentInvoiceSummary,
  AdjustmentItem,
  AdjustmentStudentSummary,
} from "./fee-adjustment.types.js"

export const FEE_ADJUSTMENT_LIST_INCLUDE = {
  requestedBy: { select: { id: true, name: true } },
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      student: {
        select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true },
      },
    },
  },
} satisfies Prisma.FeeAdjustmentInclude

export const FEE_ADJUSTMENT_DETAIL_INCLUDE = {
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  reversedBy: { select: { id: true, name: true } },
  overriddenBy: { select: { id: true, name: true } },
  reversalOf: {
    select: { id: true, kind: true, status: true, computedAmount: true },
  },
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      grossAmount: true,
      totalAmount: true,
      amountPaid: true,
      balance: true,
      status: true,
      className: true,
      sectionName: true,
      sessionName: true,
      student: {
        select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true },
      },
    },
  },
  student: {
    select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true },
  },
  session: { select: { id: true, name: true } },
} satisfies Prisma.FeeAdjustmentInclude

export type FeeAdjustmentListItemRow = Prisma.FeeAdjustmentGetPayload<{
  include: typeof FEE_ADJUSTMENT_LIST_INCLUDE
}>
export type FeeAdjustmentDetailRow = Prisma.FeeAdjustmentGetPayload<{
  include: typeof FEE_ADJUSTMENT_DETAIL_INCLUDE
}>

function toStudent(row: {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
}): AdjustmentStudentSummary {
  return {
    id: row.id,
    admissionNumber: row.admissionNumber,
    fullName: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" "),
  }
}

function toActor(row: { id: string; name: string } | null): AdjustmentActorRef | null {
  return row ? { id: row.id, name: row.name } : null
}

export function parseApplication(value: Prisma.JsonValue | null): InstallmentApplicationLine[] {
  if (!Array.isArray(value)) return []
  const lines: InstallmentApplicationLine[] = []
  for (const entry of value) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { installmentId?: unknown }).installmentId === "string"
    ) {
      lines.push(entry as unknown as InstallmentApplicationLine)
    }
  }
  return lines
}

export function mapAdjustmentListItem(row: FeeAdjustmentListItemRow): AdjustmentItem {
  return {
    id: row.id,
    kind: row.kind,
    value: toMoney(row.value),
    computedAmount: toMoney(row.computedAmount),
    status: row.status,
    reason: row.reason,
    overridden: row.overridden,
    overrideReason: row.overrideReason,
    requestedBy: toActor(row.requestedBy),
    invoice: {
      id: row.invoice!.id,
      invoiceNumber: row.invoice!.invoiceNumber,
      student: toStudent(row.invoice!.student),
    },
    createdAt: row.createdAt.toISOString(),
  }
}

export function mapAdjustmentDetail(row: FeeAdjustmentDetailRow): AdjustmentDetail {
  return {
    id: row.id,
    kind: row.kind,
    value: toMoney(row.value),
    computedAmount: toMoney(row.computedAmount),
    status: row.status,
    reason: row.reason,
    overridden: row.overridden,
    overrideReason: row.overrideReason,
    requestedBy: toActor(row.requestedBy),
    approvedBy: toActor(row.approvedBy),
    reversedBy: toActor(row.reversedBy),
    overriddenBy: toActor(row.overriddenBy),
    reversalOf: row.reversalOf
      ? {
          id: row.reversalOf.id,
          kind: row.reversalOf.kind,
          status: row.reversalOf.status,
          computedAmount: toMoney(row.reversalOf.computedAmount),
        }
      : null,
    installmentApplication: parseApplication(row.installmentApplication),
    student: toStudent(row.student),
    session: row.session ? { id: row.session.id, name: row.session.name } : null,
    invoice: row.invoice ? toInvoiceSummary(row.invoice) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toInvoiceSummary(row: {
  id: string
  invoiceNumber: string
  grossAmount: unknown
  totalAmount: unknown
  amountPaid: unknown
  balance: unknown
  status: unknown
  className: unknown
  sectionName: unknown
  sessionName: unknown
  student: { id: string; admissionNumber: string; firstName: string; middleName: string | null; lastName: string | null }
}): AdjustmentInvoiceSummary {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    grossAmount: toMoney(row.grossAmount),
    totalAmount: toMoney(row.totalAmount),
    amountPaid: toMoney(row.amountPaid),
    balance: toMoney(row.balance),
    status: String(row.status),
    className: String(row.className),
    sectionName: row.sectionName == null ? null : String(row.sectionName),
    sessionName: String(row.sessionName),
    student: toStudent(row.student),
  }
}