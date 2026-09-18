import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
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

interface ActivationLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  expiresAt: string | null
}

function formatExpiry(value: string | null): string {
  if (!value) return "soon"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "soon"
  return date.toLocaleString()
}

/**
 * Shows the one-time parent activation link. The raw token exists only in this
 * response — it cannot be re-read later, so the admin must copy/send it now.
 */
export function ActivationLinkDialog({ open, onOpenChange, token, expiresAt }: ActivationLinkDialogProps) {
  const [copied, setCopied] = useState(false)

  const link = useMemo(
    () => (token ? `${window.location.origin}/activate?token=${encodeURIComponent(token)}` : ""),
    [token],
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success("Activation link copied")
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Could not copy — select the link and copy it manually.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activation link ready</DialogTitle>
          <DialogDescription>
            Send this one-time link to the parent. For security it is shown only once and expires on{" "}
            {formatExpiry(expiresAt)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="activationLink">Activation link</Label>
          <div className="flex gap-2">
            <Input
              id="activationLink"
              readOnly
              value={link}
              onFocus={(event) => event.target.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={handleCopy}>
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This link lets the parent set their own password. Anyone with it can activate the
            account until it is used or expires.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}