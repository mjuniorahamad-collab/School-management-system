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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateTransportRoute, useTransportVehicles, useUpdateTransportRoute } from "@/hooks/useTransport"
import { defaultRouteForm, routeFormToPayload, validateRouteForm } from "@/lib/transportFormRules"
import type { RouteFormError, RouteFormValue } from "@/lib/transportFormRules"
import type { TransportRouteListItem } from "@/types/transport"

interface RouteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: TransportRouteListItem | null
  defaultVehicleId?: string
}

export function RouteFormDialog({ open, onOpenChange, editing, defaultVehicleId }: RouteFormDialogProps) {
  const [value, setValue] = useState<RouteFormValue>(() =>
    editing
      ? {
          name: editing.name,
          code: editing.code ?? "",
          vehicleId: editing.vehicleId ?? "",
          description: editing.description ?? "",
          isActive: editing.isActive,
        }
      : { ...defaultRouteForm(), vehicleId: defaultVehicleId ?? "" },
  )
  const [errors, setErrors] = useState<RouteFormError[]>([])
  const createRoute = useCreateTransportRoute()
  const updateRoute = useUpdateTransportRoute(editing?.id ?? null)
  const { data: vehiclesData } = useTransportVehicles({ page: 1, pageSize: 100 })
  const vehicles = vehiclesData?.items ?? []

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateRouteForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    const payload = routeFormToPayload(value)
    if (editing) {
      updateRoute.mutate(payload, { onSuccess: () => onOpenChange(false) })
    } else {
      createRoute.mutate(payload, { onSuccess: () => onOpenChange(false) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Route" : "Add Route"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the route details."
              : "Create a route; a vehicle can be attached now or later."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="route-name">Route name</Label>
              <Input
                id="route-name"
                value={value.name}
                onChange={(event) => setValue({ ...value, name: event.target.value })}
                placeholder="e.g. Kampala Road"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="route-code">Route code</Label>
              <Input
                id="route-code"
                value={value.code}
                onChange={(event) => setValue({ ...value, code: event.target.value })}
                placeholder="e.g. R1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="route-vehicle">Vehicle</Label>
              <Select
                value={value.vehicleId || "none"}
                onValueChange={(vehicleId) =>
                  setValue({ ...value, vehicleId: vehicleId === "none" ? "" : vehicleId })
                }
              >
                <SelectTrigger id="route-vehicle">
                  <SelectValue placeholder="No vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vehicle</SelectItem>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.registrationNumber} · {vehicle.capacity} seats
                      {vehicle.isActive ? "" : " (inactive)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="route-description">Description</Label>
              <Textarea
                id="route-description"
                value={value.description}
                onChange={(event) => setValue({ ...value, description: event.target.value })}
                rows={2}
                placeholder="Optional notes about the route."
              />
            </div>
            {editing && (
              <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Active route</span>
                  <span className="text-xs text-muted-foreground">
                    Inactive routes cannot receive new assignments.
                  </span>
                </span>
                <Switch
                  checked={value.isActive}
                  onCheckedChange={(isActive) => setValue({ ...value, isActive })}
                  aria-label="Toggle route active state"
                />
              </label>
            )}
          </div>

          {editing && value.vehicleId && editing.vehicleCapacity && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Assigning a smaller-capacity vehicle than the seats in use will be rejected.
            </p>
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
              <Button
                type="submit"
                disabled={createRoute.isPending || updateRoute.isPending}
              >
                {createRoute.isPending || updateRoute.isPending ? "Saving..." : editing ? "Save changes" : "Add route"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}