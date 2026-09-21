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
import { useFeeInvoices } from "@/hooks/useFeeInvoices"
import { useCreatePayment } from "@/hooks/usePayments"
import { formatINR } from "@/lib/format"
import { PAYMENT_METHOD_OPTIONS } from "@/types/fees"
import type { CreatePaymentInput, PaymentMethod } from "@/types/fees"

interface PaymentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function todayISOString(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function PaymentFormDialog({ open, onOpenChange }: PaymentFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <PaymentFormContent key="new-payment" onOpenChange={onOpenChange} />}
    </Dialog>
  )
}

function PaymentFormContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [invoiceId, setInvoiceId] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("CASH")
  const [paymentDate, setPaymentDate] = useState(todayISOString)
  const [transactionRef, setTransactionRef] = useState("")
  const [notes, setNotes] = useState("")
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const invoicesQuery = useFeeInvoices({ pageSize: 100 })
  const createMutation = useCreatePayment()

  const invoices = invoicesQuery.data?.items ?? []
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId)

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
          <Label htmlFor="payment-invoice">Invoice</Label>
          <Select value={invoiceId || undefined} onValueChange={setInvoiceId}>
            <SelectTrigger id="payment-invoice" className="w-full">
              <SelectValue placeholder="Select an invoice" />
            </SelectTrigger>
            <SelectContent>
              {(invoicesQuery.data?.items ?? []).map((invoice) => (
                <SelectItem key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} — {invoice.student.fullName} · {formatINR(invoice.balance)} due
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {invoicesQuery.isError && (
            <p className="text-xs text-red-700 dark:text-red-300">Could not load invoices.</p>
          )}
          {selectedInvoice && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
              Outstanding balance is {formatINR(selectedInvoice.balance)} — amounts above this will
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