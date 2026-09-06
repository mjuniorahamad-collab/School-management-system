import { useState } from "react"
import { Users } from "lucide-react"
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
import { toast } from "sonner"
import { useCreateConversation } from "@/hooks/useMessages"
import { RecipientPicker } from "@/components/messages/RecipientPicker"
import { cn } from "@/lib/utils"
import {
  MESSAGABLE_ROLES,
  type MessageConversationType,
  type RecipientOption,
} from "@/types/messages"

interface ComposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (conversationId: string) => void
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: MessageConversationType
  onChange: (mode: MessageConversationType) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {(["DIRECT", "GROUP"] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            mode === option ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
          )}
          onClick={() => onChange(option)}
        >
          {option === "DIRECT" ? "Direct message" : "Group"}
        </button>
      ))}
    </div>
  )
}

export function ComposeDialog({ open, onOpenChange, onCreated }: ComposeDialogProps) {
  const [mode, setMode] = useState<MessageConversationType>("DIRECT")
  const [title, setTitle] = useState("")
  const [recipients, setRecipients] = useState<RecipientOption[]>([])
  const [roleNames, setRoleNames] = useState<string[]>([])
  const createMutation = useCreateConversation()

  const setRecipientSelection = (next: RecipientOption[]) => setRecipients(next)

  const toggleRole = (role: string) => {
    setRoleNames((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    )
  }

  const reset = () => {
    setMode("DIRECT")
    setTitle("")
    setRecipients([])
    setRoleNames([])
  }

  const canSubmit = mode === "GROUP" ? recipients.length > 0 || roleNames.length > 0 : recipients.length === 1

  const handleSubmit = () => {
    const type = mode
    const payload = {
      type,
      title: mode === "GROUP" && title.trim() ? title.trim() : undefined,
      recipientIds: recipients.map((item) => item.userId),
      roleNames: roleNames.length > 0 ? roleNames : undefined,
    }
    createMutation.mutate(payload, {
      onSuccess: (conversation) => {
        reset()
        onOpenChange(false)
        onCreated(conversation.id)
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Could not start the conversation.")
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">New message</DialogTitle>
          <DialogDescription>
            Start a direct thread or a small group. Group members and roles are validated against active
            accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <ModeToggle mode={mode} onChange={setMode} />

          {mode === "GROUP" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="group-title">
                Group title <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="group-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Grade 6 Science team"
                maxLength={120}
              />
            </div>
          )}

          {mode === "GROUP" ? (
            <RecipientPicker selected={recipients} onChange={setRecipientSelection} />
          ) : (
            <RecipientPicker selected={recipients} onChange={setRecipientSelection} single />
          )}

          {mode === "GROUP" && (
            <div className="flex flex-col gap-2">
              <Label>Broadcast to a role</Label>
              <div className="flex flex-wrap gap-1.5">
                {MESSAGABLE_ROLES.map((role) => {
                  const active = roleNames.includes(role)
                  return (
                    <button
                      key={role}
                      type="button"
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium",
                        active
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                      onClick={() => toggleRole(role)}
                      aria-pressed={active}
                    >
                      {role.replace(/_/g, " ").toLowerCase()}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Roles must carry message permission in this school and are capped at 50 people per group.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
            <Users className="size-4" aria-hidden="true" />
            Start conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}