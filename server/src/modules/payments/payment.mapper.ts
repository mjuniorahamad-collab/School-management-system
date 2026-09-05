import { Prisma } from "@prisma/client"
import { toMoney } from "../../lib/money.js"
import { toDateISO } from "../fee-invoices/fee-invoice.rules.js"
import type {
  PaymentDetail,
  PaymentListItem,
  PaymentReceiptSummary,
  PaymentStudentSummary,
} from "./payment.types.js"

export const FEE_PAYMENT_LIST_INCLUDE = {
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      student: {
        select: {
          id: true,
          admissionNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
        },
      },
    },
  },
  receipt: { select: { id: true, receiptNumber: true } },
} satisfies Prisma.FeePaymentInclude

export const FEE_PAYMENT_DETAIL_INCLUDE = {
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      amountPaid: true,
      balance: true,
      status: true,
      className: true,
      sectionName: true,
      sessionName: true,
      student: {
        select: {
          id: true,
          admissionNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
        },
      },
    },
  },
  receipt: { select: { id: true, receiptNumber: true, balanceAfter: true } },
  recordedByUser: { select: { id: true, name: true } },
} satisfies Prisma.FeePaymentInclude

export type FeePaymentListItemRow = Prisma.FeePaymentGetPayload<{
  include: typeof FEE_PAYMENT_LIST_INCLUDE
}>
export type FeePaymentDetailRow = Prisma.FeePaymentGetPayload<{
  include: typeof FEE_PAYMENT_DETAIL_INCLUDE
}>

function toStudent(row: {
  id: string
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string | null
}): PaymentStudentSummary {
  return {
    id: row.id,
    admissionNumber: row.admissionNumber,
    fullName: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" "),
  }
}

const PAYMENT_STATUS = "SUCCESS" as const

export function mapPaymentListItem(row: FeePaymentListItemRow): PaymentListItem {
  return {
    id: row.id,
    paymentNumber: row.paymentNumber,
    amount: toMoney(row.amount),
    method: row.method,
    transactionRef: row.transactionRef,
    paymentDate: toDateISO(row.paymentDate),
    status: PAYMENT_STATUS,
    invoice: {
      id: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      student: toStudent(row.invoice.student),
    },
    receipt: row.receipt ? { id: row.receipt.id, receiptNumber: row.receipt.receiptNumber } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function mapPaymentDetail(row: FeePaymentDetailRow): PaymentDetail {
  return {
    id: row.id,
    paymentNumber: row.paymentNumber,
    amount: toMoney(row.amount),
    method: row.method,
    transactionRef: row.transactionRef,
    paymentDate: toDateISO(row.paymentDate),
    notes: row.notes,
    status: PAYMENT_STATUS,
    invoice: {
      id: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      totalAmount: toMoney(row.invoice.totalAmount),
      amountPaid: toMoney(row.invoice.amountPaid),
      balance: toMoney(row.invoice.balance),
      status: row.invoice.status,
      className: row.invoice.className,
      sectionName: row.invoice.sectionName,
      sessionName: row.invoice.sessionName,
      student: toStudent(row.invoice.student),
    },
    receipt: row.receipt ? toReceiptSummary(row.receipt) : null,
    recordedBy: row.recordedByUser
      ? { id: row.recordedByUser.id, name: row.recordedByUser.name }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toReceiptSummary(row: {
  id: string
  receiptNumber: string
  balanceAfter: unknown
}): PaymentReceiptSummary {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    balanceAfter: toMoney(row.balanceAfter),
  }
}