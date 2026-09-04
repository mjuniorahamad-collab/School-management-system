import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateTeacher, useUpdateTeacher } from "@/hooks/useTeachers"
import {
  type TeacherFormError,
  type TeacherFormValue,
  teacherFormToPayload,
  validateTeacherForm,
} from "@/lib/teacherFormRules"
import { TEACHER_GENDER_OPTIONS, type TeacherDetail, type TeacherListItem } from "@/types/teachers"

interface TeacherFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  teacher?: TeacherListItem | TeacherDetail | null
}

const EMPTY: TeacherFormValue = {
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  address: "",
  designation: "",
  qualification: "",
  experience: "",
  joiningDate: new Date().toISOString().slice(0, 10),
}

function toFormValue(teacher?: TeacherListItem | TeacherDetail | null): TeacherFormValue {
  if (!teacher) return EMPTY
  return {
    firstName: teacher.firstName ?? "",
    middleName: teacher.middleName ?? "",
    lastName: teacher.lastName ?? "",
    gender: teacher.gender,
    dateOfBirth: "dateOfBirth" in teacher && teacher.dateOfBirth ? teacher.dateOfBirth.slice(0, 10) : "",
    email: teacher.email ?? "",
    phone: teacher.phone ?? "",
    address: "address" in teacher ? (teacher as TeacherDetail).address ?? "" : "",
    designation: teacher.designation,
    qualification: "qualification" in teacher ? (teacher as TeacherDetail).qualification ?? "" : "",
    experience: "experience" in teacher && (teacher as TeacherDetail).experience != null
      ? String((teacher as TeacherDetail).experience)
      : "",
    joiningDate: teacher.joiningDate ? teacher.joiningDate.slice(0, 10) : "",
  }
}

export function TeacherFormDialog({ open, onOpenChange, teacher }: TeacherFormDialogProps) {
  const editMode = Boolean(teacher)
  const formKey = teacher?.id ?? "new"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editMode ? "Edit Teacher" : "Add Teacher"}</DialogTitle>
        </DialogHeader>
        <TeacherFormInner
          key={formKey}
          initialValue={toFormValue(teacher)}
          editMode={editMode}
          teacher={teacher}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}

function TeacherFormInner({
  initialValue,
  editMode,
  teacher,
  onOpenChange,
}: {
  initialValue: TeacherFormValue
  editMode: boolean
  teacher?: TeacherListItem | TeacherDetail | null
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<TeacherFormValue>(initialValue)
  const [errors, setErrors] = useState<TeacherFormError[]>([])
  const createTeacher = useCreateTeacher()
  const updateTeacher = useUpdateTeacher(teacher?.id ?? "")

  const fieldError = (field: keyof TeacherFormValue) => {
    const error = errors.find((e) => e.field === field)
    return error ? (
      <p className="mt-1 text-xs text-destructive">{error.message}</p>
    ) : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const formErrors = validateTeacherForm(value)
    if (formErrors.length > 0) {
      setErrors(formErrors)
      return
    }
    setErrors([])
    const payload = teacherFormToPayload(value)
    if (editMode && teacher) {
      await updateTeacher.mutateAsync(payload, { onSuccess: () => onOpenChange(false) })
    } else {
      await createTeacher.mutateAsync(payload, { onSuccess: () => onOpenChange(false) })
    }
  }

  const isSaving = createTeacher.isPending || updateTeacher.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="First name" required error={fieldError("firstName")}>
          <Input value={value.firstName} onChange={(e) => setValue({ ...value, firstName: e.target.value })} />
        </Field>
        <Field label="Middle name" error={fieldError("middleName")}>
          <Input value={value.middleName} onChange={(e) => setValue({ ...value, middleName: e.target.value })} />
        </Field>
        <Field label="Last name" error={fieldError("lastName")}>
          <Input value={value.lastName} onChange={(e) => setValue({ ...value, lastName: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Gender" required error={fieldError("gender")}>
          <Select value={value.gender} onValueChange={(v) => setValue({ ...value, gender: v })}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {TEACHER_GENDER_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date of birth" error={fieldError("dateOfBirth")}>
          <Input type="date" value={value.dateOfBirth} onChange={(e) => setValue({ ...value, dateOfBirth: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email" error={fieldError("email")}>
          <Input type="email" value={value.email} onChange={(e) => setValue({ ...value, email: e.target.value })} />
        </Field>
        <Field label="Phone" error={fieldError("phone")}>
          <Input value={value.phone} onChange={(e) => setValue({ ...value, phone: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Designation" required error={fieldError("designation")}>
          <Input value={value.designation} onChange={(e) => setValue({ ...value, designation: e.target.value })} />
        </Field>
        <Field label="Joining date" required error={fieldError("joiningDate")}>
          <Input type="date" value={value.joiningDate} onChange={(e) => setValue({ ...value, joiningDate: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Qualification" error={fieldError("qualification")}>
          <Input value={value.qualification} onChange={(e) => setValue({ ...value, qualification: e.target.value })} />
        </Field>
        <Field label="Experience (years)" error={fieldError("experience")}>
          <Input type="number" min={0} value={value.experience} onChange={(e) => setValue({ ...value, experience: e.target.value })} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : editMode ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Field({ label, required, error, children }: {
  label: string
  required?: boolean
  error: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error}
    </div>
  )
}
