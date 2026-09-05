import { Prisma } from "@prisma/client"
import { toMoney } from "../../lib/money.js"
import { toDateISO } from "../fee-invoices/fee-invoice.rules.js"
import type { ReceiptDetail, ReceiptListItem } from "./receipt.types.js"

export const FEE_RECEIPT_LIST_INCLUDE = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
} satisfies Prisma.FeeReceiptInclude

export const FEE_RECEIPT_DETAIL_INCLUDE = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
  payment: { select: { id: true, paymentNumber: true } },
} satisfies Prisma.FeeReceiptInclude

export type FeeReceiptListItemRow = Prisma.FeeReceiptGetPayload<{
  include: typeof FEE_RECEIPT_LIST_INCLUDE
}>
export type FeeReceiptDetailRow = Prisma.FeeReceiptGetPayload<{
  include: typeof FEE_RECEIPT_DETAIL_INCLUDE
}>

export function mapReceiptListItem(row: FeeReceiptListItemRow): ReceiptListItem {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    studentName: row.studentName,
    admissionNumber: row.admissionNumber,
    className: row.className,
    sectionName: row.sectionName,
    sessionName: row.sessionName,
    invoiceNumber: row.invoiceNumber,
    amount: toMoney(row.amount),
    balanceAfter: toMoney(row.balanceAfter),
    method: row.method,
    receiptDate: toDateISO(row.paymentDate),
    receivedByName: row.receivedByName,
    createdAt: row.createdAt.toISOString(),
  }
}

export function mapReceiptDetail(row: FeeReceiptDetailRow): ReceiptDetail {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    student: {
      id: row.student.id,
      admissionNumber: row.student.admissionNumber,
      fullName: [row.student.firstName, row.student.middleName, row.student.lastName]
        .filter(Boolean)
        .join(" "),
    },
    className: row.className,
    sectionName: row.sectionName,
    sessionName: row.sessionName,
    sessionYear: row.sessionYear,
    invoiceNumber: row.invoiceNumber,
    invoiceTotal: toMoney(row.invoiceTotal),
    amount: toMoney(row.amount),
    balanceAfter: toMoney(row.balanceAfter),
    method: row.method,
    transactionRef: row.transactionRef,
    receiptDate: toDateISO(row.paymentDate),
    receivedByName: row.receivedByName,
    payment: row.payment ? { id: row.payment.id, paymentNumber: row.payment.paymentNumber } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}