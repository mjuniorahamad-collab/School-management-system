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
import { useCreateTransportStop, useUpdateTransportStop } from "@/hooks/useTransport"
import { defaultStopForm, stopFormToPayload, validateStopForm } from "@/lib/transportFormRules"
import type { StopFormError, StopFormValue } from "@/lib/transportFormRules"

interface StopFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  routeId: string | null
  editingName?: string
  stopId?: string
}

export function StopFormDialog({ open, onOpenChange, routeId, editingName, stopId }: StopFormDialogProps) {
  const [value, setValue] = useState<StopFormValue>(() => ({ ...defaultStopForm(), name: editingName ?? "" }))
  const [errors, setErrors] = useState<StopFormError[]>([])
  const createStop = useCreateTransportStop(routeId)
  const updateStop = useUpdateTransportStop(routeId, stopId ?? null)
  const isEdit = Boolean(stopId && editingName !== undefined)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateStopForm(value)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    const payload = stopFormToPayload(value)
    if (isEdit) {
      updateStop.mutate(payload, { onSuccess: () => onOpenChange(false) })
    } else {
      createStop.mutate(payload, { onSuccess: () => onOpenChange(false) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rename Stop" : "Add Stop"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the stop name." : "Add a pick-up / drop-off point to this route."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop-name">Stop name</Label>
            <Input
              id="stop-name"
              value={value.name}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
              placeholder="e.g. Ntinda"
              required
            />
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
              <Button type="submit" disabled={createStop.isPending || updateStop.isPending}>
                {createStop.isPending || updateStop.isPending ? "Saving..." : isEdit ? "Save changes" : "Add stop"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}