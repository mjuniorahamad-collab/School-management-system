import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateExam, useExamContext, useUpdateExam } from "@/hooks/useExams"
import {
  defaultExamForm,
  emptySubjectRow,
  examFormToPayload,
  examMetadataToPayload,
  validateExamForm,
} from "@/lib/examFormRules"
import type { ExamFormValue, ExamSubjectRow } from "@/lib/examFormRules"
import { CREATABLE_EXAM_STATUSES, EXAM_STATUS_LABELS } from "@/types/exams"
import type { ExamListItem } from "@/types/exams"

const SUBJECT_LIMIT = 30

interface ExaminationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ExamListItem | null
}

export function ExaminationFormDialog({ open, onOpenChange, editing }: ExaminationFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit examination" : "New examination"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the examination details. Subjects are managed from the detail view."
              : "Schedule an examination with its subject and teacher mapping."}
          </DialogDescription>
        </DialogHeader>
        <ExaminationFormInner key={editing?.id ?? "new"} editing={editing} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  )
}

function ExaminationFormInner({
  editing,
  onOpenChange,
}: {
  editing: ExamListItem | null
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<ExamFormValue>(() => {
    const base = defaultExamForm()
    if (editing) {
      return {
        ...base,
        academicSessionId: editing.academicSessionId,
        examTypeId: editing.examTypeId,
        name: editing.name,
        classId: editing.classId,
        sectionId: editing.sectionId ?? "",
        startDate: editing.startDate,
        endDate: editing.endDate,
        status: editing.status === "ARCHIVED" || editing.status === "FINAL" ? "DRAFT" : editing.status,
      }
    }
    return { ...base, subjects: [emptySubjectRow()] }
  })

  const { data: context } = useExamContext()
  const sessions = context?.academicSessions ?? []
  const examTypes = context?.examTypes ?? []
  const subjects = context?.subjects ?? []
  const classes = context?.classes ?? []
  const teachers = context?.teachers ?? []

  const selectedClass = classes.find((item) => item.id === form.classId)
  const sectionOptions = selectedClass?.sections ?? []

  const createMutation = useCreateExam()
  const updateMutation = useUpdateExam(editing?.id ?? "")
  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = <K extends keyof ExamFormValue>(field: K, value: ExamFormValue[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleClassChange = (value: string) => {
    setForm((previous) => ({ ...previous, classId: value, sectionId: "" }))
  }

  const setSubjectRow = (index: number, patch: Partial<ExamSubjectRow>) => {
    setForm((previous) => ({
      ...previous,
      subjects: previous.subjects.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))
  }

  const addSubjectRow = () => {
    setForm((previous) => ({ ...previous, subjects: [...previous.subjects, emptySubjectRow()] }))
  }

  const removeSubjectRow = (index: number) => {
    setForm((previous) => ({
      ...previous,
      subjects: previous.subjects.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateExamForm(form)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    if (editing) {
      updateMutation.mutate(examMetadataToPayload(form), {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    } else {
      createMutation.mutate(examFormToPayload(form), {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    }
  }

  const isCreate = !editing

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Academic session" required>
          <Input value={sessions.find((s) => s.id === form.academicSessionId)?.name ?? "—"} disabled />
        </Field>
        <Field label="Exam type" required>
          <Input value={examTypes.find((t) => t.id === form.examTypeId)?.name ?? "—"} disabled />
        </Field>
      </div>
      <Field label="Name" required>
        <Input
          value={form.name}
          onChange={(event) => setField("name", event.target.value)}
          placeholder="e.g. Term 1 Examination"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Class" required>
          {isCreate ? (
            <Select value={form.classId} onValueChange={handleClassChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={selectedClass?.name ?? "—"} disabled />
          )}
        </Field>
        <Field label="Section">
          <Select
            value={form.sectionId}
            onValueChange={(value) => setField("sectionId", value === "whole" ? "" : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Whole class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whole">Whole class</SelectItem>
              {sectionOptions.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Start date" required>
          <Input
            type="date"
            value={form.startDate}
            onChange={(event) => setField("startDate", event.target.value)}
          />
        </Field>
        <Field label="End date" required>
          <Input
            type="date"
            value={form.endDate}
            onChange={(event) => setField("endDate", event.target.value)}
          />
        </Field>
      </div>

      {isCreate && (
        <>
          <div className="flex items-center justify-between">
            <Field label="Subjects" required>
              <span className="text-xs text-muted-foreground">
                Map subjects to teachers with their max and pass marks.
              </span>
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            {form.subjects.map((row, index) => (
              <SubjectRowEditor
                key={index}
                index={index}
                row={row}
                subjects={subjects}
                teachers={teachers}
                onChange={(patch) => setSubjectRow(index, patch)}
                onRemove={() => removeSubjectRow(index)}
              />
            ))}
          </div>
          {form.subjects.length < SUBJECT_LIMIT && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={addSubjectRow}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add subject
            </Button>
          )}
        </>
      )}

      {editing ? (
        <Field label="Status" required>
          <Input
            value={EXAM_STATUS_LABELS[editing.status === "FINAL" ? "FINAL" : editing.status]}
            disabled
          />
        </Field>
      ) : (
        <Field label="Status" required>
          <Select
            value={form.status}
            onValueChange={(value) => setField("status", value as ExamFormValue["status"])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CREATABLE_EXAM_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {EXAM_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : editing ? "Save changes" : "Create examination"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function SubjectRowEditor({
  index,
  row,
  subjects,
  teachers,
  onChange,
  onRemove,
}: {
  index: number
  row: ExamSubjectRow
  subjects: Array<{ id: string; code: string; name: string }>
  teachers: Array<{ id: string; name: string }>
  onChange: (patch: Partial<ExamSubjectRow>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_5rem_5rem_auto]">
        <Field label={`Subject ${index + 1}`} required>
          <Select value={row.subjectId} onValueChange={(value) => onChange({ subjectId: value })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name} ({subject.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Teacher" required>
          <Select value={row.teacherId} onValueChange={(value) => onChange({ teacherId: value })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Max" required>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={row.maxMarks}
            onChange={(event) => onChange({ maxMarks: event.target.value })}
            placeholder="100"
          />
        </Field>
        <Field label="Pass" required>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={row.passMarks}
            onChange={(event) => onChange({ passMarks: event.target.value })}
            placeholder="40"
          />
        </Field>
        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove subject ${index + 1}`}
            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  )
}