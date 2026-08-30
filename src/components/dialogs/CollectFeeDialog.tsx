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
import { useRecentStudents } from "@/hooks/useDashboardData"
import { formatINR } from "@/lib/format"

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Cheque", "Bank Transfer"]

const INSTALLMENTS = [
  "Term 1 fee",
  "Term 2 fee",
  "Annual fee",
  "Transport fee",
  "Other",
]

interface CollectFeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CollectFeeDialog({ open, onOpenChange }: CollectFeeDialogProps) {
  const { data: students } = useRecentStudents()
  const [studentId, setStudentId] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("")
  const [installment, setInstallment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const selected = students?.find((student) => student.id === studentId)
  const numericAmount = Number.parseFloat(amount.replace(/[^0-9.]/g, "")) || 0

  const reset = () => {
    setStudentId("")
    setAmount("")
    setMethod("")
    setInstallment("")
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!selected || numericAmount <= 0 || !method) return
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      toast.success("Payment collected", {
        description: `${formatINR(numericAmount)} from ${selected.name} · ${method}.`,
      })
      reset()
      onOpenChange(false)
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Collect Fees</DialogTitle>
          <DialogDescription>Record a payment received from a student.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee-student">Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger id="fee-student">
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {students?.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name} · Class {student.studentClass}-{student.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fee-amount">Amount</Label>
              <Input
                id="fee-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="e.g. 25000"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fee-installment">Fee head</Label>
              <Select value={installment} onValueChange={setInstallment}>
                <SelectTrigger id="fee-installment">
                  <SelectValue placeholder="Select head" />
                </SelectTrigger>
                <SelectContent>
                  {INSTALLMENTS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee-method">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="fee-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <DialogDemoNote />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !selected || numericAmount <= 0 || !method}
              >
                {submitting ? "Recording..." : "Collect payment"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}