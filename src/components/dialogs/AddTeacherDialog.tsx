import { useState } from "react"
import type { FormEvent } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DialogDemoNote } from "@/components/dialogs/DialogDemoNote"

const SUBJECT_OPTIONS = [
  "Mathematics",
  "Science",
  "English",
  "Hindi",
  "Social Studies",
  "Computer Science",
]

interface AddTeacherDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddTeacherDialog({ open, onOpenChange }: AddTeacherDialogProps) {
  const [fullName, setFullName] = useState("")
  const [subject, setSubject] = useState("")
  const [contact, setContact] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setFullName("")
    setSubject("")
    setContact("")
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!fullName.trim() || !subject) return
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      toast.success("Teacher added", {
        description: `${fullName} · ${subject}.`,
      })
      reset()
      onOpenChange(false)
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Teacher</DialogTitle>
          <DialogDescription>Create a teacher profile and allocate a subject.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="teacher-name">Full name</Label>
            <Input
              id="teacher-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="e.g. Kavita Rao"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="teacher-subject">Subject</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger id="teacher-subject">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="teacher-contact">Contact number</Label>
            <Input
              id="teacher-contact"
              type="tel"
              inputMode="numeric"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="e.g. 98XXXXXXXX"
            />
          </div>

          <DialogFooter>
            <DialogDemoNote />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !fullName.trim() || !subject}>
                {submitting ? "Adding..." : "Add teacher"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}