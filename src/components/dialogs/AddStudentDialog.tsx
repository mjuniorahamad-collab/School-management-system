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

const CLASS_OPTIONS = [
  "6",
  "7",
  "8",
  "9",
  "10",
]

interface AddStudentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddStudentDialog({ open, onOpenChange }: AddStudentDialogProps) {
  const [fullName, setFullName] = useState("")
  const [studentClass, setStudentClass] = useState("")
  const [section, setSection] = useState("A")
  const [guardian, setGuardian] = useState("")
  const [contact, setContact] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setFullName("")
    setStudentClass("")
    setSection("A")
    setGuardian("")
    setContact("")
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!fullName.trim() || !studentClass) return
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      toast.success("Student added", {
        description: `${fullName} enrolled in Class ${studentClass} · ${section}.`,
      })
      reset()
      onOpenChange(false)
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
          <DialogDescription>Enrol a new student into the school.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-name">Full name</Label>
            <Input
              id="student-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="e.g. Aditya Singh"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="student-class">Class</Label>
              <Select value={studentClass} onValueChange={setStudentClass}>
                <SelectTrigger id="student-class">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      Class {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="student-section">Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger id="student-section">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Section A</SelectItem>
                  <SelectItem value="B">Section B</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-guardian">Guardian name</Label>
            <Input
              id="student-guardian"
              value={guardian}
              onChange={(event) => setGuardian(event.target.value)}
              placeholder="Guardian's full name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-contact">Contact number</Label>
            <Input
              id="student-contact"
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
              <Button type="submit" disabled={submitting || !fullName.trim() || !studentClass}>
                {submitting ? "Adding..." : "Add student"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}