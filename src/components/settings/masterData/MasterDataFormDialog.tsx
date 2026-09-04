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
import { Switch } from "@/components/ui/switch"

export interface FieldConfig {
  key: string
  label: string
  type?: "text" | "number" | "switch"
  placeholder?: string
  min?: number
  required?: boolean
}

interface MasterDataFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  createLabel: string
  editLabel: string
  fields: FieldConfig[]
  initial: Record<string, string | boolean>
  editingLabel?: string
  validate: (values: Record<string, string | boolean>) => string | null
  onSubmit: (values: Record<string, string | boolean>) => void
  isSubmitting: boolean
}

export function MasterDataFormDialog({
  open,
  onOpenChange,
  title,
  description,
  createLabel,
  editLabel,
  fields,
  initial,
  editingLabel,
  validate,
  onSubmit,
  isSubmitting,
}: MasterDataFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <Content
          onOpenChange={onOpenChange}
          title={title}
          description={description}
          createLabel={createLabel}
          editLabel={editLabel}
          fields={fields}
          initial={initial}
          editingLabel={editingLabel}
          validate={validate}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </Dialog>
  )
}

function Content({
  onOpenChange,
  title,
  description,
  createLabel,
  editLabel,
  fields,
  initial,
  editingLabel,
  validate,
  onSubmit,
  isSubmitting,
}: Omit<MasterDataFormDialogProps, "open">) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    initial ? { ...initial } : {},
  )
  const isEditing = Boolean(editingLabel)

  const setValue = (key: string, value: string | boolean) => {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const error = validate(values)
    if (error) {
      toast.error(error)
      return
    }
    onSubmit(values)
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEditing ? editLabel : title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {fields.map((field) => {
          const fieldId = `md-${field.key}`
          if (field.type === "switch") {
            return (
              <div key={field.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={fieldId}>{field.label}</Label>
                <Switch
                  id={fieldId}
                  checked={Boolean(values[field.key])}
                  onCheckedChange={(checked) => setValue(field.key, checked)}
                />
              </div>
            )
          }
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={fieldId}>{field.label}</Label>
              <Input
                id={fieldId}
                type={field.type === "number" ? "number" : "text"}
                min={field.min}
                value={String(values[field.key] ?? "")}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
                required={field.required}
              />
            </div>
          )
        })}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isEditing ? "Save changes" : createLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
