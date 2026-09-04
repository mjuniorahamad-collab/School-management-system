import { useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import type { SchoolSettings } from "@/types/settings"
import { cn } from "@/lib/utils"

export interface SectionField {
  key: keyof SchoolSettings | string
  label: string
  type: "text" | "number" | "select" | "switch"
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  span?: string
}

interface SectionFormProps {
  title: string
  description: string
  fields: SectionField[]
  values: Record<string, string | number | boolean>
  isSaving: boolean
  onSave: (payload: Partial<SchoolSettings>) => void
}

export function SectionForm({ title, description, fields, values, isSaving, onSave }: SectionFormProps) {
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>(() => ({ ...values }))

  const setValue = (key: string, value: string | number | boolean) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const payload: Partial<SchoolSettings> = {}
    for (const field of fields) {
      const owner = payload as Record<string, unknown>
      if (field.type === "text") owner[field.key] = String(draft[field.key] ?? "").trim()
      else if (field.type === "number") owner[field.key] = Number(draft[field.key] ?? 0)
      else if (field.type === "select") owner[field.key] = String(draft[field.key] ?? "")
      else owner[field.key] = Boolean(draft[field.key])
    }
    onSave(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const fieldId = `setting-${field.key}`
          if (field.type === "switch") {
            return (
              <div key={field.key} className={cn("flex items-center justify-between gap-3 rounded-lg border border-input p-3", field.span)}>
                <Label htmlFor={fieldId} className="text-sm">{field.label}</Label>
                <Switch
                  id={fieldId}
                  checked={Boolean(draft[field.key])}
                  onCheckedChange={(checked) => setValue(field.key, checked)}
                />
              </div>
            )
          }
          if (field.type === "select") {
            return (
              <div key={field.key} className={cn("flex flex-col gap-1.5", field.span)}>
                <Label htmlFor={fieldId}>{field.label}</Label>
                <Select
                  value={String(draft[field.key] ?? "")}
                  onValueChange={(value) => setValue(field.key, value)}
                >
                  <SelectTrigger id={fieldId} className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          }
          return (
            <div key={field.key} className={cn("flex flex-col gap-1.5", field.span)}>
              <Label htmlFor={fieldId}>{field.label}</Label>
              <Input
                id={fieldId}
                type={field.type === "number" ? "number" : "text"}
                min={field.min}
                max={field.max}
                value={String(draft[field.key] ?? "")}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}
