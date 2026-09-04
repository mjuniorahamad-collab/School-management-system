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
import { subjectFormToPayload, validateSubjectForm } from "@/lib/subjectFormRules"
import { useCreateSubject, useUpdateSubject } from "@/hooks/useSubjects"
import type { SubjectFormPayload } from "@/types/subjects"

interface SubjectFormValue {
  code: string
  name: string
  sortOrder: string
}

const EMPTY_FORM: SubjectFormValue = { code: "", name: "", sortOrder: "" }

interface SubjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: { id: string; code: string; name: string; sortOrder: number } | null
}

export function SubjectFormDialog({ open, onOpenChange, editing }: SubjectFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SubjectFormContent key={editing?.id ?? "new"} editing={editing} onOpenChange={onOpenChange} />
      )}
    </Dialog>
  )
}

function SubjectFormContent({
  editing,
  onOpenChange,
}: {
  editing: SubjectFormDialogProps["editing"]
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<SubjectFormValue>(() =>
    editing
      ? { code: editing.code, name: editing.name, sortOrder: String(editing.sortOrder) }
      : EMPTY_FORM,
  )
  const createMutation = useCreateSubject()
  const updateMutation = useUpdateSubject(editing?.id ?? "")

  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = (field: keyof SubjectFormValue, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateSubjectForm(form)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    const payload: SubjectFormPayload = subjectFormToPayload(form)
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
        <DialogTitle>{editing ? "Edit subject" : "New subject"}</DialogTitle>
        <DialogDescription>
          {editing ? "Update the subject details." : "Add a new subject to the school catalog."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject-name">Subject name</Label>
          <Input
            id="subject-name"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="e.g. Mathematics"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject-code">Subject code</Label>
          <Input
            id="subject-code"
            value={form.code}
            onChange={(event) => setField("code", event.target.value)}
            placeholder="e.g. MAT"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject-order">Sort order</Label>
          <Input
            id="subject-order"
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
            {editing ? "Save changes" : "Create subject"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
