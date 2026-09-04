import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateTimetableEntry, useUpdateTimetableEntry } from "@/hooks/useTimetable"
import {
  defaultTimetableForm,
  timetableFormToPayload,
  validateTimetableForm,
} from "@/lib/timetableFormRules"
import type { TimetableFormValue } from "@/lib/timetableFormRules"
import { academicSessionsService } from "@/services/academicSessionsService"
import { classesService } from "@/services/classesService"
import { sectionsService } from "@/services/sectionsService"
import { subjectsService } from "@/services/subjectsService"
import { teachersService } from "@/services/teachersService"
import { periodSlotsService } from "@/services/masterDataService"
import { TIMETABLE_DAY_LABELS } from "@/types/timetable"
import type { TimetableDay } from "@/types/timetable"
import type { TimetableEntryListItem } from "@/types/timetable"

interface TimetableFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: TimetableEntryListItem | null
}

export function TimetableFormDialog({ open, onOpenChange, editing }: TimetableFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Content key={editing?.id ?? "new"} editing={editing} onOpenChange={onOpenChange} />}
    </Dialog>
  )
}

function Content({
  editing,
  onOpenChange,
}: {
  editing: TimetableEntryListItem | null
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<TimetableFormValue>(() =>
    editing
      ? {
          academicSessionId: editing.academicSessionId,
          dayOfWeek: editing.dayOfWeek,
          periodSlotId: editing.periodSlotId,
          classId: editing.classId,
          sectionId: editing.sectionId,
          subjectId: editing.subjectId,
          teacherId: editing.teacherId,
        }
      : defaultTimetableForm(),
  )

  // Load reference data for dropdowns.
  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions", "options"],
    queryFn: () => academicSessionsService.list({}),
  })
  const { data: classes } = useQuery({
    queryKey: ["classes", "options"],
    queryFn: () => classesService.list({}),
  })
  const { data: sections } = useQuery({
    queryKey: ["sections", "by-class", form.classId],
    queryFn: () => (form.classId ? sectionsService.list({ classId: form.classId }) : Promise.resolve({ items: [], total: 0 })),
    enabled: Boolean(form.classId),
  })
  const { data: subjects } = useQuery({
    queryKey: ["subjects", "options"],
    queryFn: () => subjectsService.list({}),
  })
  const { data: teachers } = useQuery({
    queryKey: ["teachers", "options"],
    queryFn: () => teachersService.list({}),
  })
  const { data: periodSlots } = useQuery({
    queryKey: ["period-slots", "options"],
    queryFn: () => periodSlotsService.list({}),
  })

  const createMutation = useCreateTimetableEntry()
  const updateMutation = useUpdateTimetableEntry(editing?.id ?? "")
  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = <K extends keyof TimetableFormValue>(field: K, value: TimetableFormValue[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateTimetableForm(form)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    const payload = timetableFormToPayload(form)
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

  const selectedSections = sections?.items ?? []
  const selectedClassHasSections = selectedSections.length > 0

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit timetable entry" : "New timetable entry"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the class, teacher, and period assignment."
            : "Add a lesson to the weekly timetable."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="timetable-session">Academic session</Label>
            <Select
              value={form.academicSessionId}
              onValueChange={(value) => setField("academicSessionId", value)}
            >
              <SelectTrigger id="timetable-session" className="w-full">
                <SelectValue placeholder="Select session…" />
              </SelectTrigger>
              <SelectContent>
                {(sessions?.items ?? []).map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timetable-day">Day</Label>
                <Select
                  value={form.dayOfWeek}
                  onValueChange={(value) => setField("dayOfWeek", value as TimetableDay)}
                >
                  <SelectTrigger id="timetable-day" className="w-full">
                    <SelectValue placeholder="Select day…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIMETABLE_DAY_LABELS) as TimetableDay[]).map((day) => (
                      <SelectItem key={day} value={day}>
                        {TIMETABLE_DAY_LABELS[day]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timetable-period">Period</Label>
                <Select
                  value={form.periodSlotId}
                  onValueChange={(value) => setField("periodSlotId", value)}
                >
                  <SelectTrigger id="timetable-period" className="w-full">
                    <SelectValue placeholder="Select period…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(periodSlots?.items ?? []).map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.name} ({period.startTime}–{period.endTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timetable-class">Class</Label>
                <Select
                  value={form.classId}
                  onValueChange={(value) => {
                    setField("classId", value)
                    setField("sectionId", null)
                  }}
                >
                  <SelectTrigger id="timetable-class" className="w-full">
                    <SelectValue placeholder="Select class…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(classes?.items ?? []).map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedClassHasSections && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="timetable-section">Section</Label>
                  <Select
                    value={form.sectionId ?? ""}
                    onValueChange={(value) => setField("sectionId", value === "whole" ? null : value)}
                  >
                    <SelectTrigger id="timetable-section" className="w-full">
                      <SelectValue placeholder="Whole class…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whole">Whole class</SelectItem>
                      {selectedSections.map((section) => (
                        <SelectItem key={section.id} value={section.id}>
                          {section.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timetable-subject">Subject</Label>
                <Select
                  value={form.subjectId}
                  onValueChange={(value) => setField("subjectId", value)}
                >
                  <SelectTrigger id="timetable-subject" className="w-full">
                    <SelectValue placeholder="Select subject…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(subjects?.items ?? []).map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timetable-teacher">Teacher</Label>
                <Select
                  value={form.teacherId}
                  onValueChange={(value) => setField("teacherId", value)}
                >
                  <SelectTrigger id="timetable-teacher" className="w-full">
                    <SelectValue placeholder="Select teacher…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(teachers?.items ?? []).map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                {editing ? "Save changes" : "Add entry"}
              </Button>
            </DialogFooter>
      </form>
    </DialogContent>
  )
}
