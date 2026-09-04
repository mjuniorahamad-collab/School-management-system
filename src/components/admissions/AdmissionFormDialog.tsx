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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateAdmission, useUpdateAdmission } from "@/hooks/useAdmissions"
import {
  admissionDetailToForm,
  admissionFormToPayload,
  defaultAdmissionForm,
  validateAdmissionForm,
} from "@/lib/admissionFormRules"
import type { AdmissionFormValue } from "@/lib/admissionFormRules"
import { GUARDIAN_RELATIONSHIP_OPTIONS } from "@/types/admissions"
import type { AdmissionDetail } from "@/types/admissions"
import type { AdmissionsMeta } from "@/types/admissions"

interface AdmissionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: AdmissionDetail | null
  meta?: AdmissionsMeta
}

function detailToFormInput(editing: AdmissionDetail) {
  const { preferredAcademicSession, preferredClass, preferredSection, ...rest } = editing
  return {
    ...rest,
    preferredAcademicSessionId: preferredAcademicSession?.id,
    preferredClassId: preferredClass?.id,
    preferredSectionId: preferredSection?.id,
  }
}

export function AdmissionFormDialog({ open, onOpenChange, editing, meta }: AdmissionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <Content
          key={editing?.id ?? "new"}
          editing={editing}
          onOpenChange={onOpenChange}
          meta={meta}
        />
      )}
    </Dialog>
  )
}

function Content({
  editing,
  onOpenChange,
  meta,
}: {
  editing: AdmissionDetail | null
  onOpenChange: (open: boolean) => void
  meta?: AdmissionsMeta
}) {
  const [form, setForm] = useState<AdmissionFormValue>(() =>
    editing ? admissionDetailToForm(detailToFormInput(editing)) : defaultAdmissionForm(),
  )

  const createMutation = useCreateAdmission()
  const updateMutation = useUpdateAdmission(editing?.id ?? "")
  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = <K extends keyof AdmissionFormValue>(field: K, value: AdmissionFormValue[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateAdmissionForm(form)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    const payload = admissionFormToPayload(form)
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

  const sessions = meta?.academicSessions ?? []
  const classes = meta?.classes ?? []
  const selectedClass = classes.find((cls) => cls.id === form.preferredClassId)

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit application" : "New admission application"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the applicant's details and preferences."
            : "Capture a prospective student and their guardian to start the admission pipeline."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <legend className="text-sm font-medium text-foreground">Applicant</legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-first-name">First name</Label>
            <Input
              id="admission-first-name"
              value={form.firstName}
              onChange={(event) => setField("firstName", event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-middle-name">Middle name</Label>
            <Input
              id="admission-middle-name"
              value={form.middleName}
              onChange={(event) => setField("middleName", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-last-name">Last name</Label>
            <Input
              id="admission-last-name"
              value={form.lastName}
              onChange={(event) => setField("lastName", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-dob">Date of birth</Label>
            <Input
              id="admission-dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => setField("dateOfBirth", event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-gender">Gender</Label>
            <Select
              value={form.gender}
              onValueChange={(value) => setField("gender", value as AdmissionFormValue["gender"])}
            >
              <SelectTrigger id="admission-gender" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-email">Email</Label>
            <Input
              id="admission-email"
              type="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-phone">Phone</Label>
            <Input
              id="admission-phone"
              value={form.phone}
              onChange={(event) => setField("phone", event.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="text-sm font-medium text-foreground">Address (optional)</legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-address1">Address line 1</Label>
            <Input
              id="admission-address1"
              value={form.addressLine1}
              onChange={(event) => setField("addressLine1", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-address2">Address line 2</Label>
            <Input
              id="admission-address2"
              value={form.addressLine2}
              onChange={(event) => setField("addressLine2", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-city">City</Label>
            <Input
              id="admission-city"
              value={form.city}
              onChange={(event) => setField("city", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-state">State</Label>
            <Input
              id="admission-state"
              value={form.state}
              onChange={(event) => setField("state", event.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <legend className="text-sm font-medium text-foreground">Preferred placement (optional)</legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-session">Academic session</Label>
            <Select
              value={form.preferredAcademicSessionId}
              onValueChange={(value) => {
                setField("preferredAcademicSessionId", value === "none" ? "" : value)
              }}
            >
              <SelectTrigger id="admission-session" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-class">Class</Label>
            <Select
              value={form.preferredClassId}
              onValueChange={(value) => {
                setField("preferredClassId", value === "none" ? "" : value)
                setField("preferredSectionId", "")
              }}
            >
              <SelectTrigger id="admission-class" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-section">Section</Label>
            <Select
              value={form.preferredSectionId}
              onValueChange={(value) => setField("preferredSectionId", value === "none" ? "" : value)}
              disabled={!selectedClass || selectedClass.sections.length === 0}
            >
              <SelectTrigger id="admission-section" className="w-full">
                <SelectValue
                  placeholder={selectedClass && selectedClass.sections.length === 0 ? "No sections" : "Select…"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                {selectedClass?.sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <legend className="text-sm font-medium text-foreground">Primary guardian</legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-guardian-name">Guardian name</Label>
            <Input
              id="admission-guardian-name"
              value={form.guardianName}
              onChange={(event) => setField("guardianName", event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-guardian-phone">Guardian phone</Label>
            <Input
              id="admission-guardian-phone"
              value={form.guardianPhone}
              onChange={(event) => setField("guardianPhone", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-guardian-email">Guardian email</Label>
            <Input
              id="admission-guardian-email"
              type="email"
              value={form.guardianEmail}
              onChange={(event) => setField("guardianEmail", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admission-guardian-relationship">Relationship</Label>
            <Select
              value={form.guardianRelationshipType}
              onValueChange={(value) =>
                setField(
                  "guardianRelationshipType",
                  value as AdmissionFormValue["guardianRelationshipType"],
                )
              }
            >
              <SelectTrigger id="admission-guardian-relationship" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {GUARDIAN_RELATIONSHIP_OPTIONS.map((relationship) => (
                  <SelectItem key={relationship} value={relationship}>
                    {relationship.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </fieldset>

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
            {editing ? "Save changes" : "Create application"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
