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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useReviewAdmission } from "@/hooks/useAdmissions"
import type { AdmissionListItem } from "@/types/admissions"
import type { ReviewAdmissionPayload } from "@/types/admissions"

interface AdmissionReviewDialogProps {
  application: AdmissionListItem | null
  onOpenChange: (open: boolean) => void
}

type ReviewOutcome = "APPROVED" | "REJECTED" | "WITHDRAWN"

export function AdmissionReviewDialog({ application, onOpenChange }: AdmissionReviewDialogProps) {
  return (
    <Dialog open={Boolean(application)} onOpenChange={onOpenChange}>
      {application && (
        <ReviewForm
          key={application.id}
          application={application}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  )
}

function ReviewForm({
  application,
  onOpenChange,
}: {
  application: AdmissionListItem
  onOpenChange: (open: boolean) => void
}) {
  const [outcome, setOutcome] = useState<ReviewOutcome>("APPROVED")
  const [note, setNote] = useState("")
  const reviewMutation = useReviewAdmission()

  const isPending = reviewMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!application) return
    const payload: ReviewAdmissionPayload = { status: outcome, note: note.trim() || undefined }
    reviewMutation.mutate(
      { id: application.id, payload },
      {
        onSuccess: () => {
          setNote("")
          setOutcome("APPROVED")
          onOpenChange(false)
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Review application</DialogTitle>
        <DialogDescription>
          Decide the outcome for <span className="font-medium">{application.name}</span> (
          {application.applicationNumber}).
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-outcome">Outcome</Label>
          <Select
            value={outcome}
            onValueChange={(value) => setOutcome(value as ReviewOutcome)}
          >
            <SelectTrigger id="review-outcome" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="APPROVED">Approve</SelectItem>
              <SelectItem value="REJECTED">Reject</SelectItem>
              <SelectItem value="WITHDRAWN">Withdraw</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-note">Review note (optional)</Label>
          <Textarea
            id="review-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Notes for the record…"
            rows={3}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Apply decision"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
