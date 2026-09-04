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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useConvertAdmission } from "@/hooks/useAdmissions"
import type { AdmissionDetail, AdmissionsMeta } from "@/types/admissions"

interface AdmissionConvertDialogProps {
  application: AdmissionDetail | null
  onOpenChange: (open: boolean) => void
  meta?: AdmissionsMeta
}

export function AdmissionConvertDialog({
  application,
  onOpenChange,
  meta,
}: AdmissionConvertDialogProps) {
  return (
    <Dialog open={Boolean(application)} onOpenChange={onOpenChange}>
      {application && (
        <ConvertForm
          key={application.id}
          application={application}
          onOpenChange={onOpenChange}
          meta={meta}
        />
      )}
    </Dialog>
  )
}

function ConvertForm({
  application,
  onOpenChange,
  meta,
}: {
  application: AdmissionDetail
  onOpenChange: (open: boolean) => void
  meta?: AdmissionsMeta
}) {
  const sessions = meta?.academicSessions ?? []
  const classes = meta?.classes ?? []
  const activeSessions = sessions.filter((session) => session.status === "ACTIVE")

  const [academicSessionId, setAcademicSessionId] = useState(
    application.preferredAcademicSession?.id ?? activeSessions[0]?.id ?? "",
  )
  const [classId, setClassId] = useState(application.preferredClass?.id ?? "")
  const [sectionId, setSectionId] = useState(application.preferredSection?.id ?? "")

  const convertMutation = useConvertAdmission()
  const isPending = convertMutation.isPending

  const selectedClass = classes.find((cls) => cls.id === classId)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!academicSessionId) {
      toast.error("Select an active academic session for the new student")
      return
    }
    if (!classId) {
      toast.error("Select a class for the new student")
      return
    }
    convertMutation.mutate(
      {
        id: application.id,
        payload: {
          academicSessionId,
          classId,
          sectionId: sectionId || undefined,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Convert to student</DialogTitle>
        <DialogDescription>
          Enrol <span className="font-medium">{application.name}</span> ({application.applicationNumber}
          ) as a new student. A fresh admission number is generated automatically.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="convert-session">Academic session</Label>
          <Select
            value={academicSessionId}
            onValueChange={(value) => value !== "none" && setAcademicSessionId(value)}
          >
            <SelectTrigger id="convert-session" className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {activeSessions.length === 0 && (
                <SelectItem value="none">No active session</SelectItem>
              )}
              {activeSessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="convert-class">Class</Label>
          <Select
            value={classId}
            onValueChange={(value) => {
              setClassId(value === "none" ? "" : value)
              setSectionId("")
            }}
          >
            <SelectTrigger id="convert-class" className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select…</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="convert-section">Section</Label>
          <Select
            value={sectionId}
            onValueChange={(value) => setSectionId(value === "none" ? "" : value)}
            disabled={!selectedClass || selectedClass.sections.length === 0}
          >
            <SelectTrigger id="convert-section" className="w-full">
              <SelectValue
                placeholder={
                  selectedClass && selectedClass.sections.length === 0
                    ? "No sections"
                    : "Select…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {selectedClass && selectedClass.sections.length === 0
                  ? "No sections"
                  : "No preference"}
              </SelectItem>
              {selectedClass?.sections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Converting…" : "Convert to student"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
