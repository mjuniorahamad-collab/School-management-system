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
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useFeeInvoices } from "@/hooks/useFeeInvoices"
import { useRequestConcession } from "@/hooks/useConcessions"
import { concessionRequestFormToPayload, validateConcessionRequestForm } from "@/lib/concessionFormRules"
import { formatINR } from "@/lib/format"
import type { AdjustmentKind } from "@/types/concessions"
import { ADJUSTMENT_KIND_LABELS } from "@/types/concessions"

interface ConcessionRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConcessionRequestDialog({ open, onOpenChange }: ConcessionRequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ConcessionRequestContent key="new-concession" onOpenChange={onOpenChange} />}
    </Dialog>
  )
}

function ConcessionRequestContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [invoiceId, setInvoiceId] = useState("")
  const [kind, setKind] = useState<AdjustmentKind>("FIXED_AMOUNT")
  const [value, setValue] = useState("")
  const [reason, setReason] = useState("")

  const sessionsQuery = useAcademicSessions({ status: "ACTIVE" })
  const activeSessionId = sessionsQuery.data?.items[0]?.id
  const invoicesQuery = useFeeInvoices({ pageSize: 100, sessionId: activeSessionId ?? undefined })
  const requestMutation = useRequestConcession()

  const invoices = (invoicesQuery.data?.items ?? []).filter(
    (invoice) => invoice.status !== "PAID" && invoice.balance > 0,
  )
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId)
  const isSaving = requestMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateConcessionRequestForm({ invoiceId, kind, value, reason })
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    requestMutation.mutate(concessionRequestFormToPayload({ invoiceId, kind, value, reason }), {
      onSuccess: () => onOpenChange(false),
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Request concession</DialogTitle>
        <DialogDescription>
          Reduces a student's bill on an invoice of the current academic session. Concessions are
          applied to the earliest unpaid installments once approved.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!activeSessionId ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            There is no active academic session. Concessions can only be requested against the
            active session's invoices.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="concession-invoice">Student invoice</Label>
              <Select value={invoiceId || undefined} onValueChange={setInvoiceId}>
                <SelectTrigger id="concession-invoice" className="w-full">
                  <SelectValue placeholder="Select an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((invoice) => (
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
                  {selectedInvoice.student.admissionNumber} · {selectedInvoice.className}
                  {selectedInvoice.sectionName ? ` / ${selectedInvoice.sectionName}` : ""} ·{" "}
                  {formatINR(selectedInvoice.balance)} outstanding
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="concession-kind">Type</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as AdjustmentKind)}>
                  <SelectTrigger id="concession-kind" className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_AMOUNT">{ADJUSTMENT_KIND_LABELS.FIXED_AMOUNT}</SelectItem>
                    <SelectItem value="PERCENTAGE">{ADJUSTMENT_KIND_LABELS.PERCENTAGE}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="concession-value">
                  {kind === "PERCENTAGE" ? "Percentage" : "Amount"}
                </Label>
                <Input
                  id="concession-value"
                  type="number"
                  min="0"
                  max={kind === "PERCENTAGE" ? 100 : undefined}
                  step="0.01"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={kind === "PERCENTAGE" ? "e.g. 10" : "0.00"}
                  required
                />
              </div>
            </div>
            {kind === "PERCENTAGE" && (
              <p className="text-xs text-muted-foreground">
                The amount is calculated from the invoice's total bill at approval and is capped at
                100%.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="concession-reason">Reason</Label>
              <Textarea
                id="concession-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Optional — why is this concession being granted?"
                rows={2}
              />
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving || !activeSessionId}>
            {isSaving ? "Requesting…" : "Request concession"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}