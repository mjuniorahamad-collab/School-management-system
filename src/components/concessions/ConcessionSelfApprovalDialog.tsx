import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useApproveConcession } from "@/hooks/useConcessions"
import type { AdjustmentListItem } from "@/types/concessions"
import { formatINR } from "@/lib/format"

const REASON_MAX_LENGTH = 500

/**
 * Confirmation for approving a request the acting user raised themselves. Shown
 * only when the school's policy permits self-approval, and the reason is
 * MANDATORY: it waives segregation of duties, so the decision needs a rationale
 * of its own in the audit trail. The server enforces the same rule and rejects a
 * blank reason with 400.
 */
export function ConcessionSelfApprovalDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: AdjustmentListItem | null
}) {
  const [reason, setReason] = useState("")
  const approve = useApproveConcession()

  const trimmed = reason.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= REASON_MAX_LENGTH

  const close = () => {
    setReason("")
    onOpenChange(false)
  }

  const submit = () => {
    if (!item || !canSubmit) return
    approve.mutate({ id: item.id, payload: { reason: trimmed } }, { onSuccess: close })
  }

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Approve your own request</DialogTitle>
          <DialogDescription>
            This school allows requesters to approve their own concessions. You requested this{" "}
            {item.kind === "PERCENTAGE" ? `${item.value}%` : formatINR(item.value)} concession for{" "}
            {item.invoice.student.fullName}, so a reason is required and will be recorded in the
            audit log alongside your name.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="self-approval-reason">Reason</Label>
          <Textarea
            id="self-approval-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX_LENGTH}
            rows={3}
            autoFocus
            placeholder="Why are you approving your own request?"
            aria-describedby="self-approval-reason-hint"
          />
          <p id="self-approval-reason-hint" className="text-xs text-muted-foreground">
            Required · {reason.trim().length}/{REASON_MAX_LENGTH}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={close} disabled={approve.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || approve.isPending}>
            {approve.isPending ? "Approving…" : "Approve concession"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
