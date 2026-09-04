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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { sessionFormToPayload } from "@/lib/sessionFormRules"
import { useCreateAcademicSession, useUpdateAcademicSession } from "@/hooks/useAcademicSessions"
import { SESSION_STATUS_OPTIONS } from "@/types/academicSessions"
import type { AcademicSessionFormPayload } from "@/types/academicSessions"

interface SessionFormValue {
  name: string
  code: string
  startDate: string
  endDate: string
  status: string
}

const EMPTY_FORM: SessionFormValue = {
  name: "",
  code: "",
  startDate: "",
  endDate: "",
  status: "",
}

function initialForm(editing: { name: string; code: string; startDate: string; endDate: string; status: string } | null): SessionFormValue {
  return editing
    ? {
        name: editing.name,
        code: editing.code,
        startDate: editing.startDate,
        endDate: editing.endDate,
        status: editing.status,
      }
    : EMPTY_FORM
}

interface SessionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: {
    id: string
    name: string
    code: string
    startDate: string
    endDate: string
    status: string
  } | null
}

export function SessionFormDialog({ open, onOpenChange, editing }: SessionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SessionFormContent
          key={editing?.id ?? "new"}
          editing={editing}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  )
}

function SessionFormContent({
  editing,
  onOpenChange,
}: {
  editing: SessionFormDialogProps["editing"]
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<SessionFormValue>(() => initialForm(editing))
  const createMutation = useCreateAcademicSession()
  const updateMutation = useUpdateAcademicSession(editing?.id ?? "")

  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = (field: keyof SessionFormValue, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const payload: AcademicSessionFormPayload = sessionFormToPayload(form)
    if (editing) {
      updateMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit academic session" : "New academic session"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the session details below."
            : "Create an academic session for the school year."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-name">Session name</Label>
          <Input
            id="session-name"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="e.g. Academic Year 2024–2025"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-code">Session code</Label>
          <Input
            id="session-code"
            value={form.code}
            onChange={(event) => setField("code", event.target.value)}
            placeholder="e.g. 2024-25"
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-start">Start date</Label>
            <Input
              id="session-start"
              type="date"
              value={form.startDate}
              onChange={(event) => setField("startDate", event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-end">End date</Label>
            <Input
              id="session-end"
              type="date"
              value={form.endDate}
              onChange={(event) => setField("endDate", event.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-status">Status</Label>
          <Select value={form.status} onValueChange={(value) => setField("status", value)}>
            <SelectTrigger id="session-status" className="w-full">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {SESSION_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {editing ? "Save changes" : "Create session"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
