import { Prisma } from "@prisma/client"
import { toMoney } from "../../lib/money.js"
import {
  deriveInstallmentStatus,
  deriveInvoiceStatus,
  toDateISO,
  todayISODate,
} from "./fee-invoice.rules.js"
import type {
  FeeInvoiceDetail,
  FeeInvoiceInstallment,
  FeeInvoiceItemSnapshot,
  FeeInvoiceListItem,
  FeeInvoiceStudent,
} from "./fee-invoice.types.js"

export const FEE_INVOICE_DETAIL_INCLUDE = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
  session: { select: { id: true, name: true, code: true } },
  installments: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.FeeInvoiceInclude

export const FEE_INVOICE_LIST_INCLUDE = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
  installments: {
    select: { amountPaid: true, balance: true, dueDate: true, sortOrder: true },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.FeeInvoiceInclude

export type FeeInvoiceDetailRow = Prisma.FeeInvoiceGetPayload<{
  include: typeof FEE_INVOICE_DETAIL_INCLUDE
}>
export type FeeInvoiceListItemRow = Prisma.FeeInvoiceGetPayload<{
  include: typeof FEE_INVOICE_LIST_INCLUDE
}>

function studentFullName(row: {
  firstName: string
  middleName: string | null
  lastName: string | null
}): string {
  return [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ")
}

function toStudent(row: Prisma.FeeInvoiceGetPayload<{ include: typeof FEE_INVOICE_DETAIL_INCLUDE }>["student"]): FeeInvoiceStudent {
  const fullName = studentFullName(row)
  return { id: row.id, admissionNumber: row.admissionNumber, fullName }
}

function toItems(json: Prisma.JsonValue): FeeInvoiceItemSnapshot[] {
  if (!Array.isArray(json)) return []
  const items: FeeInvoiceItemSnapshot[] = []
  for (const entry of json) {
    if (entry === null || typeof entry !== "object") continue
    const item = entry as Record<string, unknown>
    if (
      typeof item.feeHeadId === "string" &&
      typeof item.feeHeadCode === "string" &&
      typeof item.feeHeadName === "string" &&
      typeof item.amount === "number"
    ) {
      items.push({
        feeHeadId: item.feeHeadId,
        feeHeadCode: item.feeHeadCode,
        feeHeadName: item.feeHeadName,
        amount: item.amount,
        sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
      })
    }
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder)
}

export function mapFeeInvoiceDetail(row: FeeInvoiceDetailRow): FeeInvoiceDetail {
  const today = todayISODate()
  const installments: FeeInvoiceInstallment[] = row.installments.map((installment) => ({
    id: installment.id,
    installmentNo: installment.installmentNo,
    label: installment.label,
    amount: toMoney(installment.amount),
    amountPaid: toMoney(installment.amountPaid),
    balance: toMoney(installment.balance),
    dueDate: toDateISO(installment.dueDate),
    status: deriveInstallmentStatus(
      {
        amountPaid: toMoney(installment.amountPaid),
        balance: toMoney(installment.balance),
        dueDateISO: toDateISO(installment.dueDate),
      },
      today,
    ),
  }))

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    student: toStudent(row.student),
    session: { id: row.session.id, name: row.session.name, code: row.session.code },
    className: row.className,
    sectionName: row.sectionName,
    feeStructureId: row.feeStructureId,
    totalAmount: toMoney(row.totalAmount),
    amountPaid: toMoney(row.amountPaid),
    balance: toMoney(row.balance),
    status: deriveInvoiceStatus(
      installments.map((installment) => ({
        amountPaid: installment.amountPaid,
        balance: installment.balance,
        dueDateISO: installment.dueDate,
      })),
      today,
    ),
    items: toItems(row.items as Prisma.JsonValue),
    installments,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function mapFeeInvoiceListItem(row: FeeInvoiceListItemRow): FeeInvoiceListItem {
  const today = todayISODate()

  const installments = row.installments
    .map((installment) => ({
      amountPaid: toMoney(installment.amountPaid),
      balance: toMoney(installment.balance),
      dueDateISO: toDateISO(installment.dueDate),
    }))
    .sort((a, b) => a.dueDateISO.localeCompare(b.dueDateISO))

  const status = deriveInvoiceStatus(installments, today)
  const nextOutstanding = installments.find((installment) => installment.balance > 0)

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    student: {
      id: row.student.id,
      admissionNumber: row.student.admissionNumber,
      fullName: studentFullName(row.student),
    },
    className: row.className,
    sectionName: row.sectionName,
    sessionName: row.sessionName,
    totalAmount: toMoney(row.totalAmount),
    amountPaid: toMoney(row.amountPaid),
    balance: toMoney(row.balance),
    status,
    nextDueDate: nextOutstanding ? nextOutstanding.dueDateISO : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}