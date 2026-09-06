import { useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStaffs } from "@/hooks/useStaff"
import { useCreateTransportDriver, useTransportRoutes, useUpdateTransportDriver } from "@/hooks/useTransport"
import { defaultDriverForm, driverFormToPayload, validateDriverForm } from "@/lib/transportFormRules"
import type { DriverFormError, DriverFormValue } from "@/lib/transportFormRules"
import type { TransportDriverListItem } from "@/types/transport"

interface DriverFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: TransportDriverListItem | null
}

interface DriverFormState extends DriverFormValue {
  isActive: boolean
}

export function DriverFormDialog({ open, onOpenChange, editing }: DriverFormDialogProps) {
  const [value, setValue] = useState<DriverFormState>(() =>
    editing
      ? {
          staffId: editing.staffId,
          routeId: editing.routeId ?? "",
          roleLabel: editing.roleLabel,
          isActive: editing.isActive,
        }
      : { ...defaultDriverForm(), isActive: true },
  )
  const [errors, setErrors] = useState<DriverFormError[]>([])
  const createDriver = useCreateTransportDriver()
  const updateDriver = useUpdateTransportDriver(editing?.id ?? null)
  const { data: staffData } = useStaffs({ page: 1, pageSize: 100 })
  const { data: routesData } = useTransportRoutes({ page: 1, pageSize: 100 })
  const staff = staffData?.items ?? []
  const routes = routesData?.items ?? []

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateDriverForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    const payload = driverFormToPayload(value)
    if (editing) {
      updateDriver.mutate({ ...payload, isActive: value.isActive }, { onSuccess: () => onOpenChange(false) })
    } else {
      createDriver.mutate(payload, { onSuccess: () => onOpenChange(false) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Driver" : "Add Driver"}</DialogTitle>
          <DialogDescription>
            Link an existing staff member as a driver; the route is optional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="driver-staff">Staff member</Label>
              <Select
                value={value.staffId || "none"}
                onValueChange={(staffId) => setValue({ ...value, staffId: staffId === "none" ? "" : staffId })}
              >
                <SelectTrigger id="driver-staff">
                  <SelectValue placeholder="Select a staff member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Select a staff member
                  </SelectItem>
                  {staff.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} · {person.employeeId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="driver-route">Route</Label>
              <Select
                value={value.routeId || "none"}
                onValueChange={(routeId) => setValue({ ...value, routeId: routeId === "none" ? "" : routeId })}
              >
                <SelectTrigger id="driver-route">
                  <SelectValue placeholder="No route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No route</SelectItem>
                  {routes.map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.name}
                      {route.isActive ? "" : " (inactive)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="driver-role">Role label</Label>
              <Input
                id="driver-role"
                value={value.roleLabel}
                onChange={(event) => setValue({ ...value, roleLabel: event.target.value })}
                placeholder="e.g. Driver"
              />
            </div>
          </div>

          {editing && (
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Active driver</span>
                <span className="text-xs text-muted-foreground">
                  Inactive drivers remain linked to their staff record as history.
                </span>
              </span>
              <Switch
                checked={value.isActive}
                onCheckedChange={(isActive) => setValue({ ...value, isActive })}
                aria-label="Toggle driver active state"
              />
            </label>
          )}

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
              <Button type="submit" disabled={createDriver.isPending || updateDriver.isPending}>
                {createDriver.isPending || updateDriver.isPending
                  ? "Saving..."
                  : editing
                    ? "Save changes"
                    : "Add driver"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}