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

const REPORT_TYPES = [
  { value: "attendance", label: "Attendance Report" },
  { value: "fees", label: "Fee Collection Report" },
  { value: "results", label: "Results Report" },
  { value: "enrolment", label: "Enrolment Report" },
  { value: "staff", label: "Staff Directory" },
]

const SESSIONS = ["2024–25", "2025–26", "2026–27"]

const FORMATS = ["PDF", "Excel", "CSV"]

interface GenerateReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GenerateReportDialog({ open, onOpenChange }: GenerateReportDialogProps) {
  const [reportType, setReportType] = useState("")
  const [session, setSession] = useState("")
  const [format, setFormat] = useState("PDF")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setReportType("")
    setSession("")
    setFormat("PDF")
  }

  const handleSubmit = () => {
    if (!reportType || !session) return
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      toast.success("Report generation started", {
        description: `${REPORT_TYPES.find((option) => option.value === reportType)?.label} · ${format}.`,
      })
      reset()
      onOpenChange(false)
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Report</DialogTitle>
          <DialogDescription>Choose a report type and output format.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-type">Report type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="report-type">
                <SelectValue placeholder="Select report" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-session">Session</Label>
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger id="report-session">
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {SESSIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-format">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="report-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogDemoNote />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting || !reportType || !session}>
                {submitting ? "Preparing..." : "Generate report"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}