import { useMemo, useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { useHomeworkContext, useCreateHomework, useUpdateHomework } from "@/hooks/useHomework"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useTeachers } from "@/hooks/useTeachers"
import {
  defaultHomeworkForm,
  homeworkFormToPayload,
  validateHomeworkForm,
} from "@/lib/homeworkFormRules"
import type { HomeworkFormValue } from "@/lib/homeworkFormRules"
import { CREATABLE_TASK_STATUSES, TASK_STATUS_OPTIONS, TASK_STATUS_LABELS } from "@/types/homework"
import type { HomeworkListItem } from "@/types/homework"

interface HomeworkFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: HomeworkListItem | null
}

export function HomeworkFormDialog({ open, onOpenChange, editing }: HomeworkFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit homework" : "New homework"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the homework targeting, details, and lifecycle."
              : "Assign homework to a class, subject, and teacher."}
          </DialogDescription>
        </DialogHeader>
        <HomeworkFormInner key={editing?.id ?? "new"} editing={editing} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  )
}

function HomeworkFormInner({
  editing,
  onOpenChange,
}: {
  editing: HomeworkListItem | null
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<HomeworkFormValue>(() => {
    const base = defaultHomeworkForm()
    if (editing) {
      return {
        ...base,
        academicSessionId: editing.academicSessionId,
        classId: editing.classId,
        sectionId: editing.sectionId ?? "",
        subjectId: editing.subjectId,
        teacherId: editing.teacherId,
        title: editing.title,
        instructions: editing.instructions ?? "",
        dueDate: editing.dueDate,
        status: editing.status,
      }
    }
    return base
  })

  const { data: context } = useHomeworkContext()
  const { data: sessions } = useAcademicSessions({})
  const { data: teachers } = useTeachers({ pageSize: 100 })

  const isTeacherActor = Boolean(context?.teacherId)
  const subjects = context?.subjects ?? []
  const classes = context?.classes ?? []

  // Derive the effective targeting instead of syncing state in effects: the
  // session falls back to the first active one and a teacher actor always
  // targets their own linked profile.
  const sessionList = sessions?.items ?? []
  const defaultSessionId =
    sessionList.find((session) => session.status === "ACTIVE")?.id ??
    sessionList[0]?.id ??
    ""
  const effectiveSessionId = form.academicSessionId || defaultSessionId
  const effectiveTeacherId = isTeacherActor ? (context?.teacherId ?? "") : form.teacherId

  const teacherOptions = useMemo(() => {
    const options = (teachers?.items ?? []).map((teacher) => ({ id: teacher.id, name: teacher.name }))
    if (editing && !options.some((option) => option.id === editing.teacherId)) {
      options.unshift({ id: editing.teacherId, name: editing.teacherName })
    }
    return options
  }, [teachers, editing])

  const selectedClass = classes.find((item) => item.id === form.classId)
  const sectionOptions = selectedClass?.sections ?? []
  const statusOptions = editing ? TASK_STATUS_OPTIONS : CREATABLE_TASK_STATUSES

  const createMutation = useCreateHomework()
  const updateMutation = useUpdateHomework(editing?.id ?? "")
  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = <K extends keyof HomeworkFormValue>(field: K, value: HomeworkFormValue[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleClassChange = (value: string) => {
    setForm((previous) => ({ ...previous, classId: value, sectionId: "" }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const effective: HomeworkFormValue = {
      ...form,
      academicSessionId: effectiveSessionId,
      teacherId: effectiveTeacherId,
    }
    const errors = validateHomeworkForm(effective)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    const payload = homeworkFormToPayload(effective)
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Academic session" required>
          <Select
            value={effectiveSessionId}
            onValueChange={(value) => setField("academicSessionId", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {sessionList.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.name} ({session.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Due date" required>
          <Input
            type="date"
            value={form.dueDate}
            onChange={(event) => setField("dueDate", event.target.value)}
          />
        </Field>
      </div>
      <Field label="Title" required>
        <Input
          value={form.title}
          onChange={(event) => setField("title", event.target.value)}
          placeholder="e.g. Chapter 4 exercises"
        />
      </Field>
      <Field label="Instructions">
        <Textarea
          value={form.instructions}
          onChange={(event) => setField("instructions", event.target.value)}
          placeholder="Optional instructions for students…"
          rows={4}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Subject" required>
          <Select value={form.subjectId} onValueChange={(value) => setField("subjectId", value)}>
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
        <Field label="Class" required>
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
        <Field label="Teacher" required>
          {isTeacherActor ? (
            <Input value={context?.teacherName ?? "You"} disabled />
          ) : (
            <Select value={form.teacherId} onValueChange={(value) => setField("teacherId", value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {teacherOptions.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Status" required>
          <Select value={form.status} onValueChange={(value) => setField("status", value as HomeworkFormValue["status"])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : editing ? "Save changes" : "Create homework"}
        </Button>
      </DialogFooter>
    </form>
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