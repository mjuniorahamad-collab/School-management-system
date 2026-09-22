import { useState } from "react"
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
import { useOverrideConcession } from "@/hooks/useConcessions"
import { formatINR } from "@/lib/format"
import type { AdjustmentListItem } from "@/types/concessions"

interface ConcessionOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: AdjustmentListItem | null
}

export function ConcessionOverrideDialog({ open, onOpenChange, item }: ConcessionOverrideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && item && <OverrideContent key={item.id} item={item} onOpenChange={onOpenChange} />}
    </Dialog>
  )
}

function OverrideContent({
  item,
  onOpenChange,
}: {
  item: AdjustmentListItem
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState("")
  const overrideMutation = useOverrideConcession()
  const isSaving = overrideMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) {
      toast.error("An override reason is required")
      return
    }
    overrideMutation.mutate(
      { id: item.id, payload: { overrideReason: reason.trim() } },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Override and approve</DialogTitle>
        <DialogDescription>
          As a super admin you can approve a concession directly. This action is mandatory — the
          decision is recorded with your reason for the audit log.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
          <span className="font-medium text-foreground">{item.invoice.student.fullName}</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {item.invoice.invoiceNumber} · {item.kind === "PERCENTAGE" ? `${item.value}%` : formatINR(item.value)}
          </span>
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-reason">Override reason</Label>
          <Input
            id="override-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required — e.g. Director's written approval"
            required
            maxLength={500}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Approving…" : "Override and approve"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}