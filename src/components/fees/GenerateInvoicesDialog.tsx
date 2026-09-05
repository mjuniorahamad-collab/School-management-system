import { useState } from "react"
import { AlertTriangle, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { FeeClassSelect } from "@/components/shared/FeeClassSelect"
import { FeeSessionSelect } from "@/components/shared/FeeSessionSelect"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useGenerateInvoices, useGenerationPreview } from "@/hooks/useFeeInvoices"
import { formatINR } from "@/lib/format"

interface GenerateInvoicesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface InstallmentDraft {
  label: string
  amount: string
  dueDate: string
}

const EMPTY_INSTALLMENT: InstallmentDraft = { label: "Term 1", amount: "", dueDate: "" }

export function GenerateInvoicesDialog({ open, onOpenChange }: GenerateInvoicesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <GenerateContent key="generate" onOpenChange={onOpenChange} />}
    </Dialog>
  )
}

function GenerateContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [sessionId, setSessionId] = useState("")
  const [classId, setClassId] = useState("")
  const [customInstallments, setCustomInstallments] = useState(false)
  const [installments, setInstallments] = useState<InstallmentDraft[]>([{ ...EMPTY_INSTALLMENT }])

  const preview = useGenerationPreview(sessionId, classId)
  const generate = useGenerateInvoices()

  const scoped = Boolean(sessionId && classId)
  const isSaving = generate.isPending

  const updateInstallment = (index: number, patch: Partial<InstallmentDraft>) => {
    setInstallments((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const plan = customInstallments
      ? installments
          .filter((row) => row.label.trim() && row.dueDate && Number(row.amount) > 0)
          .map((row) => ({ label: row.label.trim(), amount: Number(row.amount), dueDate: row.dueDate }))
      : undefined

    if (customInstallments && (!plan || plan.length === 0)) {
      toast.error("Add at least one valid installment")
      return
    }

    const previewStructure = preview.data?.feeStructure
    if (!previewStructure) {
      toast.error("This class has no active fee structure for the selected session")
      return
    }

    if (Number(preview.data?.withoutInvoice ?? 0) === 0) {
      if (!confirmInternal()) return
    }

    generate.mutate(
      { sessionId, classId, installments: plan },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  const confirmInternal = () => window.confirm("All enrolled students already have invoices. Generate anyway?")

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Generate invoices</DialogTitle>
        <DialogDescription>
          Create one invoice per active enrolled student for a class and academic session, using
          the class's active fee structure.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gen-session">Academic session</Label>
            <FeeSessionSelect
              value={sessionId}
              onValueChange={(value) => setSessionId(value ?? "")}
              placeholder="Select session"
              includeAll={false}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gen-class">Class</Label>
            <FeeClassSelect
              value={classId}
              onValueChange={(value) => setClassId(value ?? "")}
              placeholder="Select class"
              includeAll={false}
            />
          </div>
        </div>

        {scoped && preview.isPending && (
          <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-2 h-8 w-full" />
          </div>
        )}

        {scoped && preview.isError && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
            Could not load the generation preview.
          </div>
        )}

        {scoped && preview.data && (
          <div className="flex flex-col gap-3">
            {preview.data.feeStructure ? (
              <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {preview.data.feeStructure.name}
                    </p>
                    <p className="text-xs text-muted-foreground">Active fee structure</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatINR(preview.data.feeStructure.totalAmount)}
                  </p>
                </div>
                {!preview.data.feeStructure.isActive && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    This structure is deactivated — generation will be rejected.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                No fee structure is configured for this class and session.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <PreviewCard label="Enrolled" value={String(preview.data.totalEnrolled)} />
              <PreviewCard label="Already invoiced" value={String(preview.data.withInvoice)} />
              <PreviewCard label="To be invoiced" value={String(preview.data.withoutInvoice)} />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setCustomInstallments((value) => !value)}
          className="self-start text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {customInstallments ? "Use one full-fee installment" : "Split into custom installments"}
        </button>

        {customInstallments && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Leave blank to skip and instead create one &ldquo;Full fee&rdquo; installment due on the session end date.
            </p>
            {installments.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <Input
                  value={row.label}
                  onChange={(event) => updateInstallment(index, { label: event.target.value })}
                  placeholder="Label"
                  aria-label="Installment label"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(event) => updateInstallment(index, { amount: event.target.value })}
                  placeholder="Amount"
                  aria-label="Installment amount"
                  className="w-28"
                />
                <Input
                  type="date"
                  value={row.dueDate}
                  onChange={(event) => updateInstallment(index, { dueDate: event.target.value })}
                  aria-label="Installment due date"
                  className="w-40"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setInstallments((previous) =>
                      previous.length === 1 ? previous : previous.filter((_, i) => i !== index),
                    )
                  }
                  aria-label={`Remove installment ${index + 1}`}
                  className="size-8 text-muted-foreground"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setInstallments((previous) => [...previous, { ...EMPTY_INSTALLMENT }])} className="self-start h-7">
              <Plus className="size-4" aria-hidden="true" />
              Add installment
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving || !scoped || !preview.data?.feeStructure}>
            Generate invoices
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

function PreviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}