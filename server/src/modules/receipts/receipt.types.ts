import type { PaymentMethod } from "@prisma/client"

export interface ReceiptStudentSummary {
  id: string
  admissionNumber: string
  fullName: string
}

export interface ReceiptListItem {
  id: string
  receiptNumber: string
  studentName: string
  admissionNumber: string
  className: string
  sectionName: string | null
  sessionName: string
  invoiceNumber: string
  amount: number
  balanceAfter: number
  method: PaymentMethod
  receiptDate: string
  receivedByName: string | null
  createdAt: string
}

export interface ReceiptDetail {
  id: string
  receiptNumber: string
  student: ReceiptStudentSummary
  className: string
  sectionName: string | null
  sessionName: string
  sessionYear: number
  invoiceNumber: string
  invoiceTotal: number
  amount: number
  balanceAfter: number
  method: PaymentMethod
  transactionRef: string | null
  receiptDate: string
  receivedByName: string | null
  payment: { id: string; paymentNumber: string } | null
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ReceiptListResult {
  items: ReceiptListItem[]
  pagination: Pagination
}