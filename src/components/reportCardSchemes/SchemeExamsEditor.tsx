import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ExamTypeListItem } from "@/types/masterData"
import type { SchemeExamFormRow } from "@/lib/reportCardSchemeFormRules"

interface SchemeExamsEditorProps {
  rows: SchemeExamFormRow[]
  examTypes: ExamTypeListItem[]
  /** Weights are only meaningful (and only required) for PERCENTAGE_WEIGHTED. */
  showWeight: boolean
  onChangeRow: (index: number, patch: Partial<SchemeExamFormRow>) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
}

export function SchemeExamsEditor({
  rows,
  examTypes,
  showWeight,
  onChangeRow,
  onAddRow,
  onRemoveRow,
}: SchemeExamsEditorProps) {
  // An exam type the scheme already binds stays visible (and marked inactive)
  // even after it was retired, so editing the scheme never silently drops a
  // configured exam. Retired types cannot be newly chosen.
  const boundExamTypeIds = new Set(rows.map((row) => row.examTypeId).filter(Boolean))

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {showWeight
          ? "Every exam needs a strictly positive weight; the weights must sum to 1 (±0.0001)."
          : "Select the exams that make up this scheme. Weights are not used under raw-marks aggregation."}
      </p>

      {rows.map((row, index) => (
        <div
          key={row.key}
          className="rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/5"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Exam {index + 1} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={row.examTypeId}
                  onValueChange={(value) => onChangeRow(index, { examTypeId: value })}
                >
                  <SelectTrigger className="w-full" aria-label={`Exam type for exam ${index + 1}`}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {examTypes.map((examType) => {
                      const isInactive = examType.isActive === false
                      const isBound = boundExamTypeIds.has(examType.id)
                      return (
                        <SelectItem
                          key={examType.id}
                          value={examType.id}
                          disabled={isInactive && !isBound}
                        >
                          {examType.name} ({examType.code})
                          {isInactive ? " — inactive" : ""}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              {showWeight && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Weight <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    value={row.weight}
                    onChange={(event) => onChangeRow(index, { weight: event.target.value })}
                    placeholder="0.5"
                    aria-label={`Weight for exam ${index + 1}`}
                  />
                </div>
              )}
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemoveRow(index)}
                disabled={rows.length <= 1}
                aria-label={`Remove exam ${index + 1}`}
                className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAddRow}>
        <Plus className="size-4" aria-hidden="true" />
        Add exam
      </Button>
    </div>
  )
}
