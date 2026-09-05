import { useState } from "react"
import { Pencil, Plus, Save, Trash2, X } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ExamStatusBadge } from "@/components/shared/ExamStatusBadge"
import { useExamContext, useExamDetail, useUpdateExamSubjects } from "@/hooks/useExams"
import { formatFullDate } from "@/lib/format"
import type { ExamSubjectItem } from "@/types/exams"

interface ExaminationDetailDialogProps {
  examId: string | null
  onOpenChange: (open: boolean) => void
  canUpdateSubjects: boolean
}

interface SubjectDraftRow {
  subjectId: string
  teacherId: string
  maxMarks: string
  passMarks: string
}

export function ExaminationDetailDialog({
  examId,
  onOpenChange,
  canUpdateSubjects,
}: ExaminationDetailDialogProps) {
  const { data: exam } = useExamDetail(examId)
  const { data: context } = useExamContext()
  const updateSubjects = useUpdateExamSubjects(examId ?? "")
  const [editingRows, setEditingRows] = useState<SubjectDraftRow[] | null>(null)

  const subjects = context?.subjects ?? []
  const teachers = context?.teachers ?? []

  if (!exam) return null

  const isDraft = exam.status === "DRAFT"
  const editing = editingRows !== null

  const startEditing = () => {
    setEditingRows(
      exam.subjects.map((row) => ({
        subjectId: row.subjectId,
        teacherId: row.teacherId,
        maxMarks: row.maxMarks,
        passMarks: row.passMarks,
      })),
    )
  }

  const setRow = (index: number, patch: Partial<SubjectDraftRow>) => {
    setEditingRows((previous) =>
      previous ? previous.map((row, i) => (i === index ? { ...row, ...patch } : row)) : previous,
    )
  }

  const addRow = () => {
    setEditingRows((previous) => (previous ? [...previous, { subjectId: "", teacherId: "", maxMarks: "", passMarks: "" }] : previous))
  }

  const removeRow = (index: number) => {
    setEditingRows((previous) => (previous ? previous.filter((_, i) => i !== index) : previous))
  }

  const saveRows = () => {
    if (!editingRows) return
    if (editingRows.length === 0) {
      toast.error("At least one subject is required")
      return
    }
    const seen = new Set<string>()
    for (const row of editingRows) {
      const max = Number(row.maxMarks)
      const pass = Number(row.passMarks)
      if (!row.subjectId || !row.teacherId) {
        toast.error("Every subject needs a teacher and marks")
        return
      }
      if (seen.has(row.subjectId)) {
        toast.error("A subject is listed more than once")
        return
      }
      seen.add(row.subjectId)
      if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(pass) || pass <= 0) {
        toast.error("Max and pass marks must be positive numbers")
        return
      }
      if (pass > max) {
        toast.error("Pass marks cannot exceed max marks")
        return
      }
    }
    const payload = editingRows.map((row) => ({
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      maxMarks: Number(row.maxMarks),
      passMarks: Number(row.passMarks),
    }))
    updateSubjects.mutate(payload, {
      onSuccess: () => setEditingRows(null),
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <Dialog open={Boolean(examId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {exam.name}
            <ExamStatusBadge status={exam.status} />
          </DialogTitle>
          <DialogDescription>
            {exam.examTypeName} · {exam.academicSessionName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
          <Detail label="Target">
            {exam.className}
            {exam.sectionName ? ` · ${exam.sectionName}` : " · Whole class"}
          </Detail>
          <Detail label="Dates">
            {formatFullDate(exam.startDate)} – {formatFullDate(exam.endDate)}
          </Detail>
          <Detail label="Published">{exam.publishedAt ? formatFullDate(exam.publishedAt) : "—"}</Detail>
          <Detail label="Finalized">{exam.finalizedAt ? formatFullDate(exam.finalizedAt) : "—"}</Detail>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Subjects</h3>
          {isDraft && !editing && canUpdateSubjects && (
            <Button type="button" variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit subjects
            </Button>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            {editingRows?.map((row, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/5 sm:grid-cols-[1fr_1fr_5rem_5rem_auto]">
                <Select value={row.subjectId} onValueChange={(value) => setRow(index, { subjectId: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name} ({subject.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={row.teacherId} onValueChange={(value) => setRow(index, { teacherId: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={row.maxMarks}
                  onChange={(event) => setRow(index, { maxMarks: event.target.value })}
                  placeholder="Max"
                  aria-label="Max marks"
                />
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={row.passMarks}
                  onChange={(event) => setRow(index, { passMarks: event.target.value })}
                  placeholder="Pass"
                  aria-label="Pass marks"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove row ${index + 1}`}
                  className="self-end text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRow}>
              <Plus className="size-4" aria-hidden="true" />
              Add subject
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Subject</th>
                  <th scope="col" className="px-4 py-2 font-medium">Teacher</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Max</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Pass</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {exam.subjects.map((row: ExamSubjectItem) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-foreground">{row.subjectName}</p>
                      <p className="text-xs text-muted-foreground">{row.subjectCode}</p>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{row.teacherName}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.maxMarks}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.passMarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {exam.status === "FINAL" && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
            This exam is finalized. Open Results, select it, and use "Reopen" to make corrections.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {editing && (
            <>
              <Button type="button" variant="outline" onClick={() => setEditingRows(null)} disabled={updateSubjects.isPending}>
                <X className="size-4" aria-hidden="true" />
                Cancel
              </Button>
              <Button type="button" onClick={saveRows} disabled={updateSubjects.isPending}>
                <Save className="size-4" aria-hidden="true" />
                {updateSubjects.isPending ? "Saving…" : "Save subjects"}
              </Button>
            </>
          )}
          <Button type="button" variant={editing ? "outline" : "default"} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{children}</p>
    </div>
  )
}