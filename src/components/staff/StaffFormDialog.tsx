import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateStaff, useUpdateStaff } from "@/hooks/useStaff"
import {
  type StaffFormError,
  type StaffFormValue,
  staffFormToPayload,
  validateStaffForm,
} from "@/lib/staffFormRules"
import { STAFF_GENDER_OPTIONS, type StaffDetail, type StaffListItem } from "@/types/staff"

interface StaffFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff?: StaffListItem | StaffDetail | null
}

const EMPTY: StaffFormValue = {
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  address: "",
  department: "",
  designation: "",
  qualification: "",
  experience: "",
  joiningDate: new Date().toISOString().slice(0, 10),
}

function toFormValue(staff?: StaffListItem | StaffDetail | null): StaffFormValue {
  if (!staff) return EMPTY
  return {
    firstName: staff.firstName ?? "",
    middleName: staff.middleName ?? "",
    lastName: staff.lastName ?? "",
    gender: staff.gender,
    dateOfBirth: "dateOfBirth" in staff && staff.dateOfBirth ? staff.dateOfBirth.slice(0, 10) : "",
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    address: "address" in staff ? (staff as StaffDetail).address ?? "" : "",
    department: staff.department,
    designation: staff.designation,
    qualification: "qualification" in staff ? (staff as StaffDetail).qualification ?? "" : "",
    experience: "experience" in staff && (staff as StaffDetail).experience != null
      ? String((staff as StaffDetail).experience)
      : "",
    joiningDate: staff.joiningDate ? staff.joiningDate.slice(0, 10) : "",
  }
}

export function StaffFormDialog({ open, onOpenChange, staff }: StaffFormDialogProps) {
  const editMode = Boolean(staff)
  const formKey = staff?.id ?? "new"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editMode ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
        </DialogHeader>
        <StaffFormInner
          key={formKey}
          initialValue={toFormValue(staff)}
          editMode={editMode}
          staff={staff}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}

function StaffFormInner({
  initialValue,
  editMode,
  staff,
  onOpenChange,
}: {
  initialValue: StaffFormValue
  editMode: boolean
  staff?: StaffListItem | StaffDetail | null
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<StaffFormValue>(initialValue)
  const [errors, setErrors] = useState<StaffFormError[]>([])
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff(staff?.id ?? "")

  const fieldError = (field: keyof StaffFormValue) => {
    const error = errors.find((e) => e.field === field)
    return error ? (
      <p className="mt-1 text-xs text-destructive">{error.message}</p>
    ) : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const formErrors = validateStaffForm(value)
    if (formErrors.length > 0) {
      setErrors(formErrors)
      return
    }
    setErrors([])
    const payload = staffFormToPayload(value)
    if (editMode && staff) {
      await updateStaff.mutateAsync(payload, { onSuccess: () => onOpenChange(false) })
    } else {
      await createStaff.mutateAsync(payload, { onSuccess: () => onOpenChange(false) })
    }
  }

  const isSaving = createStaff.isPending || updateStaff.isPending

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
              {STAFF_GENDER_OPTIONS.map((g) => (
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
        <Field label="Department" required error={fieldError("department")}>
          <Input value={value.department} onChange={(e) => setValue({ ...value, department: e.target.value })} />
        </Field>
        <Field label="Designation" required error={fieldError("designation")}>
          <Input value={value.designation} onChange={(e) => setValue({ ...value, designation: e.target.value })} />
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
        <Field label="Qualification" error={fieldError("qualification")}>
          <Input value={value.qualification} onChange={(e) => setValue({ ...value, qualification: e.target.value })} />
        </Field>
        <Field label="Experience (years)" error={fieldError("experience")}>
          <Input type="number" min={0} value={value.experience} onChange={(e) => setValue({ ...value, experience: e.target.value })} />
        </Field>
      </div>
      <Field label="Joining date" required error={fieldError("joiningDate")}>
        <Input type="date" value={value.joiningDate} onChange={(e) => setValue({ ...value, joiningDate: e.target.value })} />
      </Field>
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
