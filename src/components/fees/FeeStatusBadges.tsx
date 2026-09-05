import { Badge } from "@/components/ui/badge"
import {
  INSTALLMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/types/fees"
import type { InstallmentStatus, InvoiceStatus, PaymentMethod, PaymentStatus } from "@/types/fees"

const INVOICE_STYLES: Record<InvoiceStatus, string> = {
  UNPAID: "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-500/15 dark:text-slate-300",
  PARTIAL: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
  PAID: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  OVERDUE: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
}

const INSTALLMENT_STYLES: Record<InstallmentStatus, string> = INVOICE_STYLES

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${INVOICE_STYLES[status]}`}>
      {INVOICE_STATUS_LABELS[status]}
    </Badge>
  )
}

export function InstallmentStatusBadge({ status }: { status: InstallmentStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${INSTALLMENT_STYLES[status]}`}>
      {INSTALLMENT_STATUS_LABELS[status]}
    </Badge>
  )
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${PAYMENT_STYLES[status]}`}>
      {status === "SUCCESS" ? "Success" : status}
    </Badge>
  )
}

export function PaymentMethodLabel({ method }: { method: PaymentMethod }) {
  return <span className="text-sm text-foreground">{PAYMENT_METHOD_LABELS[method]}</span>
}