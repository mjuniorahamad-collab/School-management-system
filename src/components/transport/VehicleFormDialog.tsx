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
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateTransportVehicle, useTransportVehicle, useUpdateTransportVehicle } from "@/hooks/useTransport"
import {
  defaultVehicleForm,
  validateVehicleForm,
  vehicleFormToPayload,
} from "@/lib/transportFormRules"
import type { VehicleFormError, VehicleFormValue } from "@/lib/transportFormRules"
import { TRANSPORT_VEHICLE_TYPE_LABELS, TRANSPORT_VEHICLE_TYPE_OPTIONS } from "@/types/transport"
import type { TransportVehicleListItem } from "@/types/transport"

interface VehicleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: TransportVehicleListItem | null
}

export function VehicleFormDialog({ open, onOpenChange, editing }: VehicleFormDialogProps) {
  if (editing) {
    return <EditVehicleDialog open={open} onOpenChange={onOpenChange} vehicle={editing} />
  }
  return <CreateVehicleDialog key={String(open)} open={open} onOpenChange={onOpenChange} />
}

function CreateVehicleDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<VehicleFormValue>(defaultVehicleForm)
  const [errors, setErrors] = useState<VehicleFormError[]>([])
  const createVehicle = useCreateTransportVehicle()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateVehicleForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    createVehicle.mutate(vehicleFormToPayload(value), { onSuccess: () => onOpenChange(false) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Vehicle</DialogTitle>
          <DialogDescription>
            A vehicle code (VEH-####) is generated automatically after saving.
          </DialogDescription>
        </DialogHeader>
        <VehicleFormContent
          value={value}
          setValue={setValue}
          errors={errors}
          submit={submit}
          submitLabel={createVehicle.isPending ? "Saving..." : "Add vehicle"}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}

function EditVehicleDialog({
  open,
  onOpenChange,
  vehicle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicle: TransportVehicleListItem
}) {
  const { data: detail, isPending, isError, refetch } = useTransportVehicle(vehicle.id)

  const content = (() => {
    if (isPending) {
      return (
        <div className="flex flex-col gap-4 py-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      )
    }
    if (isError || !detail) {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Could not load this vehicle.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Try again
          </button>
        </div>
      )
    }
    return <EditVehicleInner key={detail.id} vehicle={detail} onOpenChange={onOpenChange} />
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Vehicle</DialogTitle>
          <DialogDescription>Update the details for {detail?.vehicleCode ?? "this vehicle"}.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}

function EditVehicleInner({
  vehicle,
  onOpenChange,
}: {
  vehicle: TransportVehicleListItem
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<VehicleFormValue>(() => ({
    registrationNumber: vehicle.registrationNumber,
    type: vehicle.type,
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    year: vehicle.year ? String(vehicle.year) : "",
    capacity: String(vehicle.capacity),
    notes: vehicle.notes ?? "",
    isActive: vehicle.isActive,
  }))
  const [errors, setErrors] = useState<VehicleFormError[]>([])
  const updateVehicle = useUpdateTransportVehicle(vehicle.id)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateVehicleForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    updateVehicle.mutate(vehicleFormToPayload(value), { onSuccess: () => onOpenChange(false) })
  }

  return (
    <VehicleFormContent
      value={value}
      setValue={setValue}
      errors={errors}
      submit={submit}
      submitLabel={updateVehicle.isPending ? "Saving..." : "Save changes"}
      onOpenChange={onOpenChange}
    />
  )
}

function VehicleFormContent({
  value,
  setValue,
  errors,
  submit,
  submitLabel,
  onOpenChange,
}: {
  value: VehicleFormValue
  setValue: (value: VehicleFormValue) => void
  errors: VehicleFormError[]
  submit: (event: FormEvent) => void
  submitLabel: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="vehicle-registration">Registration number</Label>
            <Input
              id="vehicle-registration"
              value={value.registrationNumber}
              onChange={(event) => setValue({ ...value, registrationNumber: event.target.value })}
              placeholder="e.g. KCA 123 A"
              required
            />
            <p className="text-xs text-muted-foreground">Stored uppercased without spaces, e.g. KCA123A.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-type">Type</Label>
            <Select
              value={value.type}
              onValueChange={(type) => setValue({ ...value, type: type as VehicleFormValue["type"] })}
            >
              <SelectTrigger id="vehicle-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_VEHICLE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TRANSPORT_VEHICLE_TYPE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-capacity">Capacity (per trip)</Label>
            <Input
              id="vehicle-capacity"
              type="number"
              min={1}
              max={1000}
              value={value.capacity}
              onChange={(event) => setValue({ ...value, capacity: event.target.value })}
              placeholder="e.g. 40"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-make">Make</Label>
            <Input
              id="vehicle-make"
              value={value.make}
              onChange={(event) => setValue({ ...value, make: event.target.value })}
              placeholder="e.g. Toyota"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-model">Model</Label>
            <Input
              id="vehicle-model"
              value={value.model}
              onChange={(event) => setValue({ ...value, model: event.target.value })}
              placeholder="e.g. HiAce"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="vehicle-year">Year</Label>
            <Input
              id="vehicle-year"
              type="number"
              min={1950}
              max={2100}
              value={value.year}
              onChange={(event) => setValue({ ...value, year: event.target.value })}
              placeholder="e.g. 2022"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="vehicle-notes">Notes</Label>
            <Textarea
              id="vehicle-notes"
              value={value.notes}
              onChange={(event) => setValue({ ...value, notes: event.target.value })}
              rows={2}
              placeholder="Optional notes (insurance, condition, etc.)."
            />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Active vehicle</span>
              <span className="text-xs text-muted-foreground">
                Inactive vehicles cannot be assigned to routes.
              </span>
            </span>
            <Switch
              checked={value.isActive}
              onCheckedChange={(isActive) => setValue({ ...value, isActive })}
              aria-label="Toggle vehicle active state"
            />
          </label>
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
            <Button type="submit" disabled={submitLabel.startsWith("Saving")}>
              {submitLabel}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </>
  )
}