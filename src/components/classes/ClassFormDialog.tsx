import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { classFormToPayload } from "@/lib/classFormRules"
import { useCreateClass, useUpdateClass } from "@/hooks/useClasses"
import type { ClassFormPayload } from "@/types/classes"

interface ClassFormValue {
  name: string
  sortOrder: string
}

const EMPTY_FORM: ClassFormValue = { name: "", sortOrder: "" }

interface ClassFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: { id: string; name: string; sortOrder: number } | null
}

export function ClassFormDialog({ open, onOpenChange, editing }: ClassFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ClassFormContent key={editing?.id ?? "new"} editing={editing} onOpenChange={onOpenChange} />}
    </Dialog>
  )
}

function ClassFormContent({
  editing,
  onOpenChange,
}: {
  editing: ClassFormDialogProps["editing"]
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<ClassFormValue>(() =>
    editing ? { name: editing.name, sortOrder: String(editing.sortOrder) } : EMPTY_FORM,
  )
  const createMutation = useCreateClass()
  const updateMutation = useUpdateClass(editing?.id ?? "")

  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = (field: keyof ClassFormValue, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const payload: ClassFormPayload = classFormToPayload(form)
    if (editing) {
      updateMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit class" : "New class"}</DialogTitle>
        <DialogDescription>
          {editing ? "Update the class details." : "Add a new class to the school structure."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="class-name">Class name</Label>
          <Input
            id="class-name"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="e.g. 6"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="class-order">Sort order</Label>
          <Input
            id="class-order"
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => setField("sortOrder", event.target.value)}
            placeholder="0"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {editing ? "Save changes" : "Create class"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
