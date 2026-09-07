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
import { Textarea } from "@/components/ui/textarea"
import { useCreateNotification } from "@/hooks/useNotifications"
import { NOTIFICATION_TARGET_ROLES, type NotificationTargetRole } from "@/types/notifications"
import { cn } from "@/lib/utils"

function roleLabel(role: NotificationTargetRole): string {
  return role
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ")
}

interface NewNotificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewNotificationDialog({ open, onOpenChange }: NewNotificationDialogProps) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [linkPath, setLinkPath] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<Set<NotificationTargetRole>>(new Set())
  const createMutation = useCreateNotification()
  const isSaving = createMutation.isPending

  const toggleRole = (role: NotificationTargetRole) => {
    setSelectedRoles((previous) => {
      const next = new Set(previous)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  const reset = () => {
    setTitle("")
    setBody("")
    setLinkPath("")
    setSelectedRoles(new Set())
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (selectedRoles.size === 0) {
      toast.error("Select at least one role to receive this notification.")
      return
    }
    createMutation.mutate(
      {
        title,
        body: body.trim() || undefined,
        linkPath: linkPath.trim() || undefined,
        roleNames: [...selectedRoles],
      },
      {
        onSuccess: (result) => {
          reset()
          onOpenChange(false)
          toast.success(`Notification sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? "" : "s"}`)
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Could not send the notification.")
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send notification</DialogTitle>
          <DialogDescription>
            Send a school announcement to every active member of the selected roles.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notification-title">Title</Label>
            <Input
              id="notification-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Sports Day is this Friday"
              maxLength={120}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notification-body">Message</Label>
            <Textarea
              id="notification-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the announcement…"
              rows={4}
              maxLength={1000}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notification-link">Destination (optional)</Label>
            <Input
              id="notification-link"
              value={linkPath}
              onChange={(event) => setLinkPath(event.target.value)}
              placeholder="/events"
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Recipients by role</legend>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_TARGET_ROLES.map((role) => {
                const selected = selectedRoles.has(role)
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleRole(role)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {roleLabel(role)}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Sending…" : "Send notification"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}