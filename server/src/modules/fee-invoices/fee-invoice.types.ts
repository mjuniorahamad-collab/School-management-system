import type { InstallmentStatus, InvoiceStatus } from "@prisma/client"

export interface FeeInvoiceItemSnapshot {
  feeHeadId: string
  feeHeadCode: string
  feeHeadName: string
  amount: number
  sortOrder: number
}

export interface FeeInvoiceInstallment {
  id: string
  installmentNo: number
  label: string
  amount: number
  amountPaid: number
  balance: number
  dueDate: string
  status: InstallmentStatus
}

export interface FeeInvoiceStudent {
  id: string
  admissionNumber: string
  fullName: string
}

export interface FeeInvoiceDetail {
  id: string
  invoiceNumber: string
  student: FeeInvoiceStudent
  session: { id: string; name: string; code: string }
  className: string
  sectionName: string | null
  feeStructureId: string | null
  totalAmount: number
  amountPaid: number
  balance: number
  status: InvoiceStatus
  items: FeeInvoiceItemSnapshot[]
  installments: FeeInvoiceInstallment[]
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface FeeInvoiceListItem {
  id: string
  invoiceNumber: string
  student: FeeInvoiceStudent
  className: string
  sectionName: string | null
  sessionName: string
  totalAmount: number
  amountPaid: number
  balance: number
  status: InvoiceStatus
  nextDueDate: string | null
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface FeeInvoiceListResult {
  items: FeeInvoiceListItem[]
  pagination: Pagination
}

export interface GenerateInvoicesResult {
  totalEnrolled: number
  generated: number
  skippedExisting: number
  invoiceNumbers: string[]
}

export interface GenerationPreviewResult {
  feeStructure: { id: string; name: string; totalAmount: number; isActive: boolean } | null
  totalEnrolled: number
  withInvoice: number
  withoutInvoice: number
}