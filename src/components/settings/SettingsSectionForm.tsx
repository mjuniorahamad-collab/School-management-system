import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
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
import {
  MAX_REPORT_CARD_SIGNATORIES,
  type ReportCardSignatory,
  type SchoolSettings,
} from "@/types/settings"
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
  help?: string
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
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={fieldId} className="text-sm">{field.label}</Label>
                  {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
                </div>
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
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
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

interface SignatoriesFormProps {
  signatories: ReportCardSignatory[]
  isSaving: boolean
  onSave: (signatories: ReportCardSignatory[]) => void
}

/**
 * Minimal editor for the report-card signatory list. At least one signatory is
 * required before a report card can be generated, so saving is blocked while the
 * list is empty or any row is missing its role or name. The server re-validates;
 * this is only a first line of defence and a UX aid.
 */
export function SignatoriesForm({ signatories, isSaving, onSave }: SignatoriesFormProps) {
  const [draft, setDraft] = useState<ReportCardSignatory[]>(() =>
    signatories.length > 0 ? signatories.map((signatory) => ({ ...signatory })) : [],
  )

  const updateRow = (index: number, patch: Partial<ReportCardSignatory>) => {
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addRow = () =>
    setDraft((rows) =>
      rows.length >= MAX_REPORT_CARD_SIGNATORIES ? rows : [...rows, { role: "", name: "" }],
    )
  const removeRow = (index: number) => setDraft((rows) => rows.filter((_, i) => i !== index))

  const incomplete = draft.some((row) => row.role.trim() === "" || row.name.trim() === "")
  const canSave = draft.length > 0 && !incomplete

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    onSave(draft.map((row) => ({ role: row.role.trim(), name: row.name.trim() })))
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Report card signatories</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Names and roles printed on the annual report card. At least one signatory is required
          before report cards can be generated.
        </p>
      </div>

      {draft.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No signatories configured. Add at least one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {draft.map((row, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-lg border border-input p-3 sm:flex-row sm:items-end"
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`signatory-role-${index}`}>Role</Label>
                <Input
                  id={`signatory-role-${index}`}
                  value={row.role}
                  onChange={(event) => updateRow(index, { role: event.target.value })}
                  placeholder="Class Teacher"
                  maxLength={60}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`signatory-name-${index}`}>Name</Label>
                <Input
                  id={`signatory-name-${index}`}
                  value={row.name}
                  onChange={(event) => updateRow(index, { name: event.target.value })}
                  placeholder="A. Sharma"
                  maxLength={120}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove signatory ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          disabled={draft.length >= MAX_REPORT_CARD_SIGNATORIES}
        >
          <Plus aria-hidden className="h-4 w-4" />
          Add signatory
        </Button>
        <Button type="submit" disabled={isSaving || !canSave}>
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
      {!canSave && draft.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Every signatory needs both a role and a name.
        </p>
      )}
    </form>
  )
}
