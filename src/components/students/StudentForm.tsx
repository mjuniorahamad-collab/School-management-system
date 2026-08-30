import { useState } from "react"
import type { FormEvent } from "react"
import { Plus, Trash2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  GUARDIAN_RELATIONSHIP_OPTIONS,
  STUDENT_GENDER_OPTIONS,
  STUDENT_STATUS_OPTIONS,
} from "@/types/students"
import type {
  GuardianRelationshipType,
  StudentDetail,
  StudentFormPayload,
  StudentGender,
  StudentStatus,
  StudentsMeta,
} from "@/types/students"

interface StudentFormProps {
  mode: "create" | "edit"
  meta?: StudentsMeta
  initial?: StudentDetail | null
  isSubmitting: boolean
  onSubmit: (payload: StudentFormPayload) => void
}

interface GuardianFields {
  name: string
  relationshipType: string
  phone: string
  email: string
  isPrimary: boolean
  isEmergencyContact: boolean
}

function emptyGuardian(): GuardianFields {
  return {
    name: "",
    relationshipType: "PARENT",
    phone: "",
    email: "",
    isPrimary: false,
    isEmergencyContact: false,
  }
}

function toFormValues(initial?: StudentDetail | null): StudentFormPayload {
  const enrollment = initial?.enrollment
  return {
    firstName: initial?.firstName ?? "",
    middleName: initial?.middleName ?? "",
    lastName: initial?.lastName ?? "",
    dateOfBirth: initial ? initial.dateOfBirth.slice(0, 10) : "",
    gender: initial?.gender ?? "MALE",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    addressLine1: initial?.addressLine1 ?? "",
    addressLine2: initial?.addressLine2 ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    postalCode: initial?.postalCode ?? "",
    admissionDate: initial ? initial.admissionDate.slice(0, 10) : todayIso(),
    status: initial?.status,
    academicSessionId: "",
    classId: enrollment?.class.id ?? "",
    sectionId: enrollment?.section.id ?? "",
    guardians: (initial?.guardians ?? []).map((guardian) => ({
      name: guardian.name,
      relationshipType: guardian.relationshipType,
      isPrimary: guardian.isPrimary,
      isEmergencyContact: guardian.isEmergencyContact,
      email: guardian.email ?? undefined,
      phone: guardian.phone ?? undefined,
    })),
  }
}

function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function toGuardianFields(initial: StudentFormPayload): GuardianFields[] {
  if (initial.guardians.length === 0) return [emptyGuardian()]
  return initial.guardians.map((guardian) => ({
    name: guardian.name,
    relationshipType: guardian.relationshipType,
    phone: guardian.phone ?? "",
    email: guardian.email ?? "",
    isPrimary: guardian.isPrimary,
    isEmergencyContact: guardian.isEmergencyContact,
  }))
}

function isValidForm(values: StudentFormPayload, guardians: GuardianFields[]): boolean {
  const basic = values.firstName.trim() && values.lastName.trim() && values.dateOfBirth
  const placement = values.classId && values.sectionId
  const hasNamedGuardian = guardians.some((guardian) => guardian.name.trim())
  return Boolean(basic && placement && hasNamedGuardian)
}

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function StudentForm({
  mode,
  meta,
  initial,
  isSubmitting,
  onSubmit,
}: StudentFormProps) {
  const startingValues = toFormValues(initial ?? undefined)
  const [values, setValues] = useState<StudentFormPayload>(startingValues)
  const [guardians, setGuardians] = useState<GuardianFields[]>(() =>
    toGuardianFields(startingValues),
  )
  const [classId, setClassId] = useState(startingValues.classId)
  const [sectionId, setSectionId] = useState(startingValues.sectionId)
  const [status, setStatus] = useState<string>(startingValues.status ?? "")

  const activeSession = meta?.academicSessions.find((session) => session.status === "ACTIVE")
  const selectedClass = meta?.classes.find((cls) => cls.id === classId)

  const setField = <TKey extends keyof StudentFormPayload>(
    key: TKey,
    value: StudentFormPayload[TKey],
  ) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const updateGuardian = (index: number, patch: Partial<GuardianFields>) => {
    setGuardians((current) =>
      current.map((guardian, guardianIndex) =>
        guardianIndex === index ? { ...guardian, ...patch } : guardian,
      ),
    )
  }

  const handlePrimaryToggle = (index: number, checked: boolean) => {
    setGuardians((current) =>
      current.map((guardian, guardianIndex) => ({
        ...guardian,
        isPrimary: guardianIndex === index ? checked : false,
      })),
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload: StudentFormPayload = {
      ...values,
      firstName: values.firstName.trim(),
      middleName: optional(values.middleName ?? ""),
      lastName: values.lastName.trim(),
      email: optional(values.email ?? ""),
      phone: optional(values.phone ?? ""),
      addressLine1: optional(values.addressLine1 ?? ""),
      addressLine2: optional(values.addressLine2 ?? ""),
      city: optional(values.city ?? ""),
      state: optional(values.state ?? ""),
      postalCode: optional(values.postalCode ?? ""),
      academicSessionId: activeSession ? activeSession.id : undefined,
      classId,
      sectionId,
      ...(mode === "edit" && status ? { status: status as StudentStatus } : {}),
      guardians: guardians
        .filter((guardian) => guardian.name.trim())
        .map((guardian) => ({
          name: guardian.name.trim(),
          relationshipType: guardian.relationshipType as GuardianRelationshipType,
          phone: optional(guardian.phone),
          email: optional(guardian.email),
          isPrimary: Boolean(guardian.isPrimary),
          isEmergencyContact: Boolean(guardian.isEmergencyContact),
        })),
    }
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription data-slot="card-description">
            Identity and contact information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                value={values.firstName}
                onChange={(event) => setField("firstName", event.target.value)}
                required
                autoComplete="given-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="middleName">Middle name</Label>
              <Input
                id="middleName"
                value={values.middleName ?? ""}
                onChange={(event) => setField("middleName", event.target.value)}
                autoComplete="additional-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName"
                value={values.lastName}
                onChange={(event) => setField("lastName", event.target.value)}
                required
                autoComplete="family-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gender">Gender *</Label>
              <Select
                value={values.gender}
                onValueChange={(value) => setField("gender", value as StudentGender)}
              >
                <SelectTrigger id="gender" aria-label="Gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_GENDER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateOfBirth">Date of birth *</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={values.dateOfBirth}
                onChange={(event) => setField("dateOfBirth", event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={values.email ?? ""}
                onChange={(event) => setField("email", event.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={values.phone ?? ""}
                onChange={(event) => setField("phone", event.target.value)}
                autoComplete="tel"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admission & placement</CardTitle>
          <CardDescription data-slot="card-description">
            {mode === "create"
              ? "The admission number is generated by the school after saving"
              : "Move the student using both class and section"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admissionDate">Admission date</Label>
              <Input
                id="admissionDate"
                type="date"
                value={values.admissionDate}
                onChange={(event) => setField("admissionDate", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="classSelect">Class *</Label>
              <Select
                value={classId}
                onValueChange={(value) => {
                  setClassId(value)
                  setSectionId("")
                }}
              >
                <SelectTrigger id="classSelect" aria-label="Class">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {meta?.classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      Class {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sectionSelect">Section *</Label>
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={!selectedClass}
              >
                <SelectTrigger id="sectionSelect" aria-label="Section">
                  <SelectValue
                    placeholder={selectedClass ? "Select section" : "Select class first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {selectedClass?.sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "edit" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="statusSelect">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="statusSelect" aria-label="Status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription data-slot="card-description">Optional residential details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="addressLine1">Address line 1</Label>
              <Input
                id="addressLine1"
                value={values.addressLine1 ?? ""}
                onChange={(event) => setField("addressLine1", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addressLine2">Address line 2</Label>
              <Input
                id="addressLine2"
                value={values.addressLine2 ?? ""}
                onChange={(event) => setField("addressLine2", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={values.city ?? ""}
                onChange={(event) => setField("city", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={values.state ?? ""}
                onChange={(event) => setField("state", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="postalCode">Postal code</Label>
              <Input
                id="postalCode"
                inputMode="numeric"
                value={values.postalCode ?? ""}
                onChange={(event) => setField("postalCode", event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guardians</CardTitle>
          <CardDescription data-slot="card-description">
            At least one guardian is required; the primary guardian appears on reports
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {guardians.map((guardian, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-lg border border-border/60 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                  Guardian {index + 1}
                  {guardian.isPrimary && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                      Primary
                    </span>
                  )}
                </div>
                {guardians.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setGuardians((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`guardian-name-${index}`}>Name *</Label>
                  <Input
                    id={`guardian-name-${index}`}
                    value={guardian.name}
                    onChange={(event) => updateGuardian(index, { name: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`guardian-rel-${index}`}>Relationship</Label>
                  <Select
                    value={guardian.relationshipType}
                    onValueChange={(value) => updateGuardian(index, { relationshipType: value })}
                  >
                    <SelectTrigger id={`guardian-rel-${index}`} aria-label="Relationship">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GUARDIAN_RELATIONSHIP_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option
                            .split("_")
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`guardian-phone-${index}`}>Phone</Label>
                  <Input
                    id={`guardian-phone-${index}`}
                    type="tel"
                    value={guardian.phone}
                    onChange={(event) => updateGuardian(index, { phone: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`guardian-email-${index}`}>Email</Label>
                  <Input
                    id={`guardian-email-${index}`}
                    type="email"
                    value={guardian.email}
                    onChange={(event) => updateGuardian(index, { email: event.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`guardian-primary-${index}`}
                    checked={guardian.isPrimary}
                    onCheckedChange={(checked) => handlePrimaryToggle(index, checked)}
                  />
                  <Label htmlFor={`guardian-primary-${index}`} className="font-normal">
                    Primary guardian
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`guardian-emergency-${index}`}
                    checked={guardian.isEmergencyContact}
                    onCheckedChange={(checked) =>
                      updateGuardian(index, { isEmergencyContact: checked })
                    }
                  />
                  <Label htmlFor={`guardian-emergency-${index}`} className="font-normal">
                    Emergency contact
                  </Label>
                </div>
              </div>
            </div>
          ))}
          {guardians.length < 2 && (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setGuardians((current) => [...current, emptyGuardian()])}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add guardian
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={!isValidForm(values, guardians) || isSubmitting}>
          {isSubmitting ? "Saving…" : mode === "create" ? "Add Student" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}