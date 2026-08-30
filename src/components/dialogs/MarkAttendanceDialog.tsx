import { useState } from "react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DialogDemoNote } from "@/components/dialogs/DialogDemoNote"
import { StudentAvatar } from "@/components/shared/StudentAvatar"
import { useRecentStudents } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"
import type { AttendanceStatus } from "@/types"

interface MarkAttendanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const options: { value: AttendanceStatus; label: string; activeClass: string }[] = [
  { value: "present", label: "Present", activeClass: "bg-emerald-600 text-white border-emerald-600" },
  { value: "late", label: "Late", activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "absent", label: "Absent", activeClass: "bg-red-600 text-white border-red-600" },
]

export function MarkAttendanceDialog({ open, onOpenChange }: MarkAttendanceDialogProps) {
  const { data: students } = useRecentStudents()
  const [studentClass, setStudentClass] = useState("")
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})
  const [submitting, setSubmitting] = useState(false)

  const setStatus = (id: string, status: AttendanceStatus) => {
    setMarks((current) => ({ ...current, [id]: status }))
  }

  const handleSubmit = () => {
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      const counts = {
        present: 0,
        late: 0,
        absent: 0,
      }
      for (const id of Object.keys(marks)) {
        counts[marks[id]] += 1
      }
      toast.success(`Attendance saved for ${Object.keys(marks).length} students`, {
        description: `${counts.present} present · ${counts.late} late · ${counts.absent} absent`,
      })
      setMarks({})
      onOpenChange(false)
    }, 600)
  }

  const markedCount = Object.keys(marks).length
  const sampleSize = students?.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Attendance</DialogTitle>
          <DialogDescription>
            Record attendance for the selected class and date.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attendance-class">Class and date</Label>
            <Select value={studentClass} onValueChange={setStudentClass}>
              <SelectTrigger id="attendance-class">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {["6 A", "7 B", "8 A", "9 B", "10 A"].map((value) => (
                  <SelectItem key={value} value={value}>
                    Class {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {students && (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
              {students.map((student) => {
                const current = marks[student.id] ?? "present"
                return (
                  <li
                    key={student.id}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                  >
                    <StudentAvatar name={student.name} className="size-7" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{student.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        Class {student.studentClass} · {student.section}
                      </p>
                    </div>
                    <div className="flex rounded-full border bg-muted/40 p-0.5">
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={current === option.value}
                          onClick={() => setStatus(student.id, option.value)}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            current === option.value
                              ? option.activeClass
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <DialogDemoNote />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !studentClass || markedCount !== sampleSize}
            >
              {submitting ? "Saving..." : "Save attendance"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}