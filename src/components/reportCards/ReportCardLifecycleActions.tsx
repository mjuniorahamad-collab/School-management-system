import { useState } from "react"
import { Download, FileUp, Send, Stamp } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AttachReportCardArchiveDialog } from "@/components/reportCards/AttachReportCardArchiveDialog"
import { useIssueReportCard, usePublishReportCard } from "@/hooks/useReportCardMutations"
import { API_BASE_URL } from "@/lib/apiClient"
import { canDownloadReportCardArchive } from "@/lib/reportCardLifecycle"
import {
  canAttachReportCardArchive,
  canIssueReportCard,
  canPublishReportCard,
} from "@/lib/reportCardStatus"
import { buildReportCardArchiveUrl } from "@/services/reportCardService"
import type { ReportCardDetail } from "@/types/reportCard"

type ConfirmAction = "publish" | "issue"

const CONFIRM_COPY: Record<ConfirmAction, { title: string; description: string; label: string }> = {
  publish: {
    title: "Publish this version?",
    description:
      "Publishing validates the frozen results and moves the report card to pending archive. It cannot be reversed — a new version is required to change the results.",
    label: "Publish",
  },
  issue: {
    title: "Issue this report card?",
    description:
      "Issuing marks this version as the official one and supersedes any previously issued version for this student and session.",
    label: "Issue",
  },
}

/**
 * Lifecycle controls for a single card. Each affordance is gated on BOTH the
 * matching permission and the transition the backend allows from the current
 * status — the server remains authoritative and errors surface as toasts. There
 * is no artifact-metadata endpoint, so the download is offered whenever an
 * archive could exist; the server returns 404 when it does not.
 */
export function ReportCardLifecycleActions({ card }: { card: ReportCardDetail }) {
  const { can } = useAuth()
  const [attachOpen, setAttachOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const publishMutation = usePublishReportCard()
  const issueMutation = useIssueReportCard()

  const canPublish = can("report-cards:publish") && canPublishReportCard(card.status)
  const canIssue = can("report-cards:publish") && canIssueReportCard(card.status)
  const canAttach = can("report-cards:archive") && canAttachReportCardArchive(card.status)
  const canDownload = can("report-cards:view") && canDownloadReportCardArchive(card.status)

  if (!canPublish && !canIssue && !canAttach && !canDownload) return null

  const isConfirming = publishMutation.isPending || issueMutation.isPending

  const handleConfirm = () => {
    if (confirmAction === "publish") {
      publishMutation.mutate(card.id, { onSuccess: () => setConfirmAction(null) })
    } else if (confirmAction === "issue") {
      issueMutation.mutate(card.id, { onSuccess: () => setConfirmAction(null) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription data-slot="card-description">
          Draft → pending archive → issued. A new version is required to change frozen results.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {canPublish && (
            <Button onClick={() => setConfirmAction("publish")}>
              <Stamp className="size-4" aria-hidden="true" />
              Publish
            </Button>
          )}

          {canIssue && (
            <Button onClick={() => setConfirmAction("issue")}>
              <Send className="size-4" aria-hidden="true" />
              Issue
            </Button>
          )}

          {canAttach && (
            <Button variant="outline" onClick={() => setAttachOpen(true)}>
              <FileUp className="size-4" aria-hidden="true" />
              Attach PDF archive
            </Button>
          )}

          {canDownload && (
            <Button variant="outline" asChild>
              <a href={`${API_BASE_URL}${buildReportCardArchiveUrl(card.id)}`} download>
                <Download className="size-4" aria-hidden="true" />
                Download PDF
              </a>
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {card.status === "DRAFT" &&
            "Publishing validates the frozen results and moves the card to pending archive."}
          {card.status === "PENDING_ARCHIVE" &&
            "Attach the official PDF, then issue it. Issuing supersedes any previously issued version of this report card."}
          {card.status === "ISSUED" &&
            "This version is issued. Re-attaching replaces the stored artifact; corrections require a new version."}
          {card.status === "SUPERSEDED" &&
            "This version was superseded by a newer one. Its PDF archive remains available for reference."}
        </p>
      </CardContent>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmAction ? CONFIRM_COPY[confirmAction].title : ""}</DialogTitle>
            <DialogDescription>
              {confirmAction ? CONFIRM_COPY[confirmAction].description : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={isConfirming}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isConfirming}>
              {isConfirming
                ? confirmAction === "issue"
                  ? "Issuing…"
                  : "Publishing…"
                : confirmAction
                  ? CONFIRM_COPY[confirmAction].label
                  : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttachReportCardArchiveDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        reportCardId={card.id}
      />
    </Card>
  )
}
