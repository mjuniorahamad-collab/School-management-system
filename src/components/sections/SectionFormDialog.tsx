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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { validateSectionForm } from "@/lib/sectionFormRules"
import { useCreateSection, useUpdateSection, useClassesOptions } from "@/hooks/useSections"
import type { SectionFormPayload } from "@/types/sections"

interface SectionFormValue {
  classId: string
  name: string
}

interface SectionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: { id: string; classId: string; name: string } | null
}

export function SectionFormDialog({ open, onOpenChange, editing }: SectionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SectionFormContent key={editing?.id ?? "new"} editing={editing} onOpenChange={onOpenChange} />
      )}
    </Dialog>
  )
}

function SectionFormContent({
  editing,
  onOpenChange,
}: {
  editing: SectionFormDialogProps["editing"]
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<SectionFormValue>(() =>
    editing ? { classId: editing.classId, name: editing.name } : { classId: "", name: "" },
  )
  const createMutation = useCreateSection()
  const updateMutation = useUpdateSection(editing?.id ?? "")
  const { data: classes } = useClassesOptions()

  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = (field: keyof SectionFormValue, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateSectionForm(form)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    const payload: SectionFormPayload = { classId: form.classId, name: form.name.trim() }
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
        <DialogTitle>{editing ? "Edit section" : "New section"}</DialogTitle>
        <DialogDescription>
          {editing ? "Update the section details." : "Add a section under an existing class."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="section-class">Class</Label>
          <Select value={form.classId} onValueChange={(value) => setField("classId", value)}>
            <SelectTrigger id="section-class" className="w-full">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {classes?.items.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  Class {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="section-name">Section name</Label>
          <Input
            id="section-name"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="e.g. A"
            required
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
            {editing ? "Save changes" : "Create section"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
