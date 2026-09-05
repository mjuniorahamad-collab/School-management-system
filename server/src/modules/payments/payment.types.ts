import type { PaymentMethod, PaymentStatus } from "@prisma/client"

export interface PaymentStudentSummary {
  id: string
  admissionNumber: string
  fullName: string
}

export interface PaymentInvoiceSummary {
  id: string
  invoiceNumber: string
  totalAmount: number
  amountPaid: number
  balance: number
  status: string
  className: string
  sectionName: string | null
  sessionName: string
  student: PaymentStudentSummary
}

export interface PaymentReceiptSummary {
  id: string
  receiptNumber: string
  balanceAfter: number
}

export interface PaymentListItem {
  id: string
  paymentNumber: string
  amount: number
  method: PaymentMethod
  transactionRef: string | null
  paymentDate: string
  status: PaymentStatus
  invoice: {
    id: string
    invoiceNumber: string
    student: PaymentStudentSummary
  }
  receipt: { id: string; receiptNumber: string } | null
  createdAt: string
  updatedAt: string
}

export interface PaymentDetail {
  id: string
  paymentNumber: string
  amount: number
  method: PaymentMethod
  transactionRef: string | null
  paymentDate: string
  notes: string | null
  status: PaymentStatus
  invoice: PaymentInvoiceSummary
  receipt: PaymentReceiptSummary | null
  recordedBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PaymentListResult {
  items: PaymentListItem[]
  pagination: Pagination
}

export interface CreatePaymentResult {
  replayed: boolean
  payment: PaymentDetail
  receipt: PaymentReceiptSummary | null
}