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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCopyTimetableDay } from "@/hooks/useTimetable"
import {
  copyDayFormToPayload,
  defaultCopyDayForm,
  validateCopyDayForm,
} from "@/lib/timetableFormRules"
import type { CopyDayFormValue } from "@/lib/timetableFormRules"
import { TIMETABLE_DAY_LABELS } from "@/types/timetable"
import type { TimetableDay } from "@/types/timetable"

interface CopyDayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  academicSessionId: string
}

export function CopyDayDialog({ open, onOpenChange, academicSessionId }: CopyDayDialogProps) {
  const [form, setForm] = useState<CopyDayFormValue>(defaultCopyDayForm())
  const copyMutation = useCopyTimetableDay()
  const isSaving = copyMutation.isPending

  const setField = (field: keyof CopyDayFormValue, value: TimetableDay) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const error = validateCopyDayForm(form)
    if (error) {
      toast.error(error)
      return
    }
    copyMutation.mutate(copyDayFormToPayload(form, academicSessionId), {
      onSuccess: () => {
        setForm(defaultCopyDayForm())
        onOpenChange(false)
      },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setForm(defaultCopyDayForm())
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy timetable day</DialogTitle>
          <DialogDescription>
            Copy all scheduled entries from one day to another for the selected session.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="copy-source">Source day</Label>
              <Select
                value={form.sourceDay}
                onValueChange={(value) => setField("sourceDay", value as TimetableDay)}
              >
                <SelectTrigger id="copy-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIMETABLE_DAY_LABELS) as TimetableDay[]).map((day) => (
                    <SelectItem key={day} value={day}>
                      {TIMETABLE_DAY_LABELS[day]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="copy-target">Target day</Label>
              <Select
                value={form.targetDay}
                onValueChange={(value) => setField("targetDay", value as TimetableDay)}
              >
                <SelectTrigger id="copy-target" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIMETABLE_DAY_LABELS) as TimetableDay[]).map((day) => (
                    <SelectItem key={day} value={day}>
                      {TIMETABLE_DAY_LABELS[day]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              Copy day
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
