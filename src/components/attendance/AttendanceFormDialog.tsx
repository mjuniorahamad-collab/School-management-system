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
import { useUpdateAttendanceRecord } from "@/hooks/useAttendance"
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS } from "@/types/attendance"
import type { AttendanceRecordListItem, AttendanceStatusType } from "@/types/attendance"

interface AttendanceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: AttendanceRecordListItem | null
}

export function AttendanceFormDialog({ open, onOpenChange, editing }: AttendanceFormDialogProps) {
  const [status, setStatus] = useState<AttendanceStatusType>("PRESENT")
  const [note, setNote] = useState("")
  const updateMutation = useUpdateAttendanceRecord(editing?.id ?? "")
  const isSaving = updateMutation.isPending

  // Reset state when the dialog opens with a new record.
  const [lastEditingId, setLastEditingId] = useState<string | null>(null)
  if (editing?.id !== lastEditingId && open && editing) {
    setLastEditingId(editing.id)
    setStatus(editing.status)
    setNote(editing.note ?? "")
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    updateMutation.mutate(
      { status, note: note || undefined },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit attendance</DialogTitle>
          <DialogDescription>
            {editing
              ? `Update attendance for ${editing.studentName} on ${editing.date}.`
              : "Update the attendance record."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attendance-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as AttendanceStatusType)}>
              <SelectTrigger id="attendance-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ATTENDANCE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attendance-note">Note</Label>
            <Input
              id="attendance-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note"
            />
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
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
