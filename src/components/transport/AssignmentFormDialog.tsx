import { useMemo, useState } from "react"
import type { FormEvent } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateTransportAssignment, useTransportAssignmentContext } from "@/hooks/useTransport"
import {
  assignmentFormToPayload,
  defaultAssignmentForm,
  directionContribution,
  validateAssignmentForm,
} from "@/lib/transportFormRules"
import type { AssignmentFormError, AssignmentFormValue } from "@/lib/transportFormRules"
import { TRANSPORT_DIRECTION_LABELS, TRANSPORT_DIRECTION_OPTIONS } from "@/types/transport"

interface AssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AssignmentFormDialog({ open, onOpenChange }: AssignmentFormDialogProps) {
  const [value, setValue] = useState<AssignmentFormValue>(defaultAssignmentForm)
  const [errors, setErrors] = useState<AssignmentFormError[]>([])
  const [studentSearch, setStudentSearch] = useState("")
  const [studentQuery, setStudentQuery] = useState("")
  const createAssignment = useCreateTransportAssignment()
  const { data: context } = useTransportAssignmentContext(studentQuery, open)

  const sessions = context?.sessions ?? []
  const routes = context?.routes ?? []
  const students = context?.students ?? []
  const selectedRoute = useMemo(() => {
    const routeOptions = context?.routes ?? []
    return routeOptions.find((route) => route.id === value.routeId) ?? null
  }, [context, value.routeId])
  const selectedStudent = useMemo(() => {
    const studentOptions = context?.students ?? []
    const student = studentOptions.find((student) => student.id === value.studentId) ?? null
    return student
  }, [context, value.studentId])
  const selectedDirection = useMemo(() => directionContribution(value.direction), [value.direction])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateAssignmentForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    createAssignment.mutate(assignmentFormToPayload(value), { onSuccess: () => onOpenChange(false) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Student</DialogTitle>
          <DialogDescription>
            Attach a student to a route and stop for a session. Capacity is a hard ceiling per trip.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="assignment-student">Student</Label>
              <div className="flex gap-2">
                <Input
                  id="assignment-student"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Search by name or admission number"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStudentQuery(studentSearch)}
                  disabled={studentSearch === studentQuery}
                >
                  Search
                </Button>
              </div>
              <Select
                value={value.studentId || "none"}
                onValueChange={(studentId) =>
                  setValue({ ...value, studentId: studentId === "none" ? "" : studentId })
                }
              >
                <SelectTrigger id="assignment-student-select">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Select a student
                  </SelectItem>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name} · {student.admissionNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStudent && (
                <p className="text-xs text-muted-foreground">
                  {selectedStudent.name} · {selectedStudent.admissionNumber}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="assignment-session">Academic session</Label>
              <Select
                value={value.academicSessionId || "none"}
                onValueChange={(sessionId) =>
                  setValue({ ...value, academicSessionId: sessionId === "none" ? "" : sessionId })
                }
              >
                <SelectTrigger id="assignment-session">
                  <SelectValue placeholder="Select a session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Select a session
                  </SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id} disabled={session.status === "CLOSED"}>
                      {session.name}
                      {session.status === "CLOSED" ? " (closed)" : session.status === "UPCOMING" ? " (upcoming)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="assignment-route">Route</Label>
              <Select
                value={value.routeId || "none"}
                onValueChange={(routeId) => {
                  const next = { ...value, routeId: routeId === "none" ? "" : routeId }
                  setValue({ ...next, stopId: "" })
                }}
              >
                <SelectTrigger id="assignment-route">
                  <SelectValue placeholder="Select a route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Select a route
                  </SelectItem>
                  {routes.map((route) => (
                    <SelectItem key={route.id} value={route.id} disabled={!route.vehicleRegistration}>
                      {route.name}
                      {route.vehicleRegistration ? ` · ${route.vehicleRegistration}` : " · no vehicle"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRoute?.capacity && (
                <p className="text-xs text-muted-foreground">
                  {selectedRoute.vehicleRegistration} · capacity {selectedRoute.capacity} seats per trip
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="assignment-stop">Stop</Label>
              <Select
                value={value.stopId || "none"}
                onValueChange={(stopId) => setValue({ ...value, stopId: stopId === "none" ? "" : stopId })}
                disabled={!value.routeId}
              >
                <SelectTrigger id="assignment-stop">
                  <SelectValue placeholder={value.routeId ? "Select a stop" : "Choose a route first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Select a stop
                  </SelectItem>
                  {selectedRoute?.stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      {stop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="assignment-direction">Direction</Label>
              <Select
                value={value.direction}
                onValueChange={(direction) =>
                  setValue({ ...value, direction: direction as AssignmentFormValue["direction"] })
                }
              >
                <SelectTrigger id="assignment-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_DIRECTION_OPTIONS.map((direction) => (
                    <SelectItem key={direction} value={direction}>
                      {TRANSPORT_DIRECTION_LABELS[direction]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Uses {selectedDirection.morning} seat on the morning trip and {selectedDirection.afternoon}{" "}
                seat on the afternoon trip.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="assignment-notes">Notes</Label>
              <Textarea
                id="assignment-notes"
                value={value.notes}
                onChange={(event) => setValue({ ...value, notes: event.target.value })}
                rows={2}
                placeholder="Optional notes about this assignment."
              />
            </div>
          </div>

          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {errors.map((error) => (
                <li key={error.field}>{error.message}</li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createAssignment.isPending}>
                {createAssignment.isPending ? "Saving..." : "Assign student"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}