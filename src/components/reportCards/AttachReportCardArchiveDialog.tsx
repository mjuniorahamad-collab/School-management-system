import { useState, type FormEvent } from "react"
import { FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAttachReportCardArchive } from "@/hooks/useReportCardMutations"

interface AttachReportCardArchiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportCardId: string
}

export function AttachReportCardArchiveDialog({
  open,
  onOpenChange,
  reportCardId,
}: AttachReportCardArchiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attach PDF archive</DialogTitle>
          <DialogDescription>
            Upload the official PDF for this exact version. The server validates that the file
            matches this report card&apos;s frozen snapshot before it is confirmed.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <AttachForm reportCardId={reportCardId} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AttachForm({
  reportCardId,
  onOpenChange,
}: {
  reportCardId: string
  onOpenChange: (open: boolean) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const attachMutation = useAttachReportCardArchive(reportCardId)

  const invalidType = file !== null && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file || invalidType || attachMutation.isPending) return
    try {
      await attachMutation.mutateAsync(file)
      onOpenChange(false)
    } catch {
      // The mutation hook already surfaced the error via a toast.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-card-pdf" className="text-xs font-medium text-muted-foreground">
          PDF file
        </Label>
        <Input
          id="report-card-pdf"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          aria-invalid={invalidType}
        />
        {invalidType && <p className="text-xs text-destructive">Select a PDF file.</p>}
        <p className="text-xs text-muted-foreground">
          Uploading does not change the frozen results — it only stores the printable artifact for
          this version.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!file || invalidType || attachMutation.isPending}>
          <FileUp className="size-4" aria-hidden="true" />
          {attachMutation.isPending ? "Uploading…" : "Upload & confirm"}
        </Button>
      </div>
    </form>
  )
}
