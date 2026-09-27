import { useState } from "react"
import { Info } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InvoiceStatusBadge } from "@/components/fees/FeeStatusBadges"
import { useFeeInvoices } from "@/hooks/useFeeInvoices"
import { useCreatePayment } from "@/hooks/usePayments"
import { formatFullDate, formatINR } from "@/lib/format"
import { PAYMENT_METHOD_OPTIONS } from "@/types/fees"
import type { CreatePaymentInput, FeeInvoiceListItem, PaymentMethod } from "@/types/fees"

interface PaymentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Contextual mode: lock the payment to this invoice and replace the global
   * invoice picker with a read-only summary. Omit for the global picker flow.
   */
  selectedInvoice?: FeeInvoiceListItem | null
}

function todayISOString(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function PaymentFormDialog({ open, onOpenChange, selectedInvoice }: PaymentFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <PaymentFormContent
          key="new-payment"
          onOpenChange={onOpenChange}
          selectedInvoice={selectedInvoice ?? null}
        />
      )}
    </Dialog>
  )
}

function PaymentFormContent({
  onOpenChange,
  selectedInvoice,
}: {
  onOpenChange: (open: boolean) => void
  selectedInvoice: FeeInvoiceListItem | null
}) {
  const contextual = selectedInvoice !== null

  const [invoiceId, setInvoiceId] = useState(selectedInvoice?.id ?? "")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("CASH")
  const [paymentDate, setPaymentDate] = useState(todayISOString)
  const [transactionRef, setTransactionRef] = useState("")
  const [notes, setNotes] = useState("")
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // Contextual mode already knows the target, so the global list is not fetched.
  const invoicesQuery = useFeeInvoices({ pageSize: 100 }, { enabled: !contextual })
  const createMutation = useCreatePayment()

  // Global mode lists the fetched page verbatim, exactly as it did before this
  // dialog gained a contextual mode. Eligibility is deliberately NOT applied
  // here: this picker is the pre-existing Payments-page control, and narrowing
  // it would change that flow. Over-payment is rejected server-side anyway, and
  // the contextual Collect Fee path applies its own rule where the action is
  // actually offered.
  const invoices = invoicesQuery.data?.items ?? []
  // The fixed contextual invoice is authoritative and may sit outside the
  // global page, so it never depends on the fetched list.
  const targetInvoice =
    selectedInvoice ?? invoices.find((invoice) => invoice.id === invoiceId) ?? null

  const isSaving = createMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!invoiceId) {
      toast.error("Choose an invoice")
      return
    }
    const amountValue = Number(amount)
    if (!amountValue || amountValue <= 0) {
      toast.error("Enter a valid payment amount")
      return
    }
    const payload: CreatePaymentInput = {
      invoiceId,
      amount: amountValue,
      method,
      paymentDate,
      idempotencyKey,
      transactionRef: transactionRef.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    createMutation.mutate(payload, {
      onSuccess: () => onOpenChange(false),
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          Money is allocated across the invoice's installments in due-date order.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          {/* The label belongs to the Select, so it is rendered with the Select.
              In contextual mode there is no control to label, and a label
              pointing at a removed id is worse than no label at all. */}
          {contextual ? (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{selectedInvoice.invoiceNumber}</span>
                <InvoiceStatusBadge status={selectedInvoice.status} />
              </div>
              <p className="mt-1 text-sm text-foreground">{selectedInvoice.student.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {selectedInvoice.student.admissionNumber} · {selectedInvoice.className}
                {selectedInvoice.sectionName ? ` · ${selectedInvoice.sectionName}` : ""} ·{" "}
                {selectedInvoice.sessionName}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Total fee</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    {formatINR(selectedInvoice.totalAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Paid</dt>
                  <dd className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatINR(selectedInvoice.amountPaid)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Due</dt>
                  <dd className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {formatINR(selectedInvoice.balance)}
                  </dd>
                </div>
              </dl>
              {selectedInvoice.nextDueDate && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Next installment due {formatFullDate(selectedInvoice.nextDueDate)}
                </p>
              )}
            </div>
          ) : (
            <>
              <Label htmlFor="payment-invoice">Invoice</Label>
              <Select value={invoiceId || undefined} onValueChange={setInvoiceId}>
                <SelectTrigger id="payment-invoice" className="w-full">
                  <SelectValue placeholder="Select an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} — {invoice.student.fullName} · {formatINR(invoice.balance)}{" "}
                      due
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {!contextual && invoicesQuery.isError && (
            <p className="text-xs text-red-700 dark:text-red-300">Could not load invoices.</p>
          )}
          {targetInvoice && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
              Outstanding balance is {formatINR(targetInvoice.balance)} — amounts above this will
              be rejected.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Amount</Label>
            <Input
              id="payment-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-method">Method</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="payment-method" className="w-full">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1).toLowerCase().replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-date">Payment date</Label>
          <Input
            id="payment-date"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-ref">Transaction reference</Label>
          <Input
            id="payment-ref"
            value={transactionRef}
            onChange={(event) => setTransactionRef(event.target.value)}
            placeholder="Optional, e.g. UPI ref or cheque number"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-notes">Notes</Label>
          <Textarea
            id="payment-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes"
            rows={2}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          This form is safe to resubmit after a failure — retries reuse the same submission token
          and will not create duplicate payments.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}