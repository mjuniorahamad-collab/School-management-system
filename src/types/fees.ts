// Domain types for the Fees module — fee structures, invoices, payments and
// receipts. Mirrors the backend contracts under server/src/modules/ (fee-* ,
// payments, receipts). Keep the two sides in sync when the API changes.

export const INVOICE_STATUS_OPTIONS = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"] as const
export type InvoiceStatus = (typeof INVOICE_STATUS_OPTIONS)[number]

export const INSTALLMENT_STATUS_OPTIONS = ["UNPAID", "PARTIAL", "PAID", "OVERDUE"] as const
export type InstallmentStatus = (typeof INSTALLMENT_STATUS_OPTIONS)[number]

export const PAYMENT_METHOD_OPTIONS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"] as const
export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]

export type PaymentStatus = "SUCCESS"

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
}

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ------------------------- Fee structures -------------------------

export interface FeeStructureItemDetail {
  id: string
  feeHead: { id: string; code: string; name: string; isRecurring: boolean }
  amount: number
  sortOrder: number
}

export interface FeeStructureDetail {
  id: string
  name: string
  isActive: boolean
  totalAmount: number
  session: { id: string; name: string; code: string; status: string }
  class: { id: string; name: string }
  items: FeeStructureItemDetail[]
  createdAt: string
  updatedAt: string
}

export interface FeeStructureListItem {
  id: string
  name: string
  isActive: boolean
  totalAmount: number
  session: { id: string; name: string }
  class: { id: string; name: string }
  itemCount: number
  createdAt: string
  updatedAt: string
}

export interface FeeStructureListResult {
  items: FeeStructureListItem[]
  pagination: Pagination
}

export interface FeeStructureItemInput {
  feeHeadId: string
  amount: number
  sortOrder?: number
}

export interface FeeStructureFormPayload {
  name: string
  sessionId: string
  classId: string
  isActive?: boolean
  items: FeeStructureItemInput[]
}

export interface FeeStructuresQuery {
  page?: number
  pageSize?: number
  search?: string
  sessionId?: string
  classId?: string
  isActive?: string
  sortBy?: "name" | "totalAmount" | "updatedAt"
  sortDir?: "asc" | "desc"
}

// ------------------------- Fee invoices -------------------------

export interface FeeInvoiceStudent {
  id: string
  admissionNumber: string
  fullName: string
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

export interface FeeInvoiceItemSnapshot {
  feeHeadId: string
  feeHeadCode: string
  feeHeadName: string
  amount: number
  sortOrder: number
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

export interface FeeInvoiceListResult {
  items: FeeInvoiceListItem[]
  pagination: Pagination
}

export interface InstallmentInput {
  label: string
  amount: number
  dueDate: string
}

export interface GenerateInvoicesInput {
  sessionId: string
  classId: string
  installments?: InstallmentInput[]
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

export interface InvoiceQuery {
  page?: number
  pageSize?: number
  sessionId?: string
  classId?: string
  status?: InvoiceStatus
  search?: string
  sortBy?: "createdAt" | "invoiceNumber" | "totalAmount" | "studentName"
  sortDir?: "asc" | "desc"
}

// ------------------------- Payments -------------------------

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
  invoice: { id: string; invoiceNumber: string; student: PaymentStudentSummary }
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

export interface PaymentListResult {
  items: PaymentListItem[]
  pagination: Pagination
}

export interface CreatePaymentInput {
  invoiceId: string
  amount: number
  method: PaymentMethod
  paymentDate: string
  transactionRef?: string
  notes?: string
  idempotencyKey: string
}

export interface CreatePaymentResult {
  replayed: boolean
  payment: PaymentDetail
  receipt: PaymentReceiptSummary | null
}

export interface PaymentQuery {
  page?: number
  pageSize?: number
  invoiceId?: string
  method?: PaymentMethod
  from?: string
  to?: string
  search?: string
  sortBy?: "createdAt" | "paymentDate" | "amount"
  sortDir?: "asc" | "desc"
}

// ------------------------- Receipts -------------------------

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

export interface ReceiptListResult {
  items: ReceiptListItem[]
  pagination: Pagination
}

export interface ReceiptQuery {
  page?: number
  pageSize?: number
  invoiceId?: string
  from?: string
  to?: string
  search?: string
  sortBy?: "createdAt" | "receiptDate" | "amount"
  sortDir?: "asc" | "desc"
}