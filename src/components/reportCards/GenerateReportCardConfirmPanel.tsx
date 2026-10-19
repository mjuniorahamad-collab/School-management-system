import { useState, type FormEvent, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useGenerateReportCard } from "@/hooks/useReportCardMutations"
import { useReportCards } from "@/hooks/useReportCards"
import { describeReportCardGeneration } from "@/lib/reportCardLifecycle"
import type { StudentListItem } from "@/types/students"

/**
 * The confirmation step for generating a version for a picked student. It checks
 * the student's existing versions and mirrors the backend's rules: a new version
 * over a published one requires a reason, and an active draft blocks generation.
 */
export function GenerateConfirmPanel({
  student,
  sessionId,
  onOpenChange,
}: {
  student: StudentListItem
  sessionId: string
  onOpenChange: (open: boolean) => void
}) {
  const existingQuery = useReportCards({
    studentId: student.id,
    academicSessionId: sessionId,
    pageSize: 100,
  })
  const generateMutation = useGenerateReportCard()
  const [reissueReason, setReissueReason] = useState("")

  const preconditions = describeReportCardGeneration(existingQuery.data?.items ?? [])
  const classId = student.class?.id ?? ""
  const sectionId = student.section?.id ?? null

  const reasonMissing = preconditions.requiresReissueReason && reissueReason.trim().length === 0
  const blockedByDraft = preconditions.hasActiveDraft
  const checkingExisting = existingQuery.isPending || existingQuery.isError
  const submitDisabled =
    generateMutation.isPending || checkingExisting || blockedByDraft || reasonMissing || !classId

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitDisabled) return
    try {
      await generateMutation.mutateAsync({
        studentId: student.id,
        academicSessionId: sessionId,
        classId,
        sectionId,
        ...(preconditions.requiresReissueReason ? { reissueReason: reissueReason.trim() } : {}),
      })
      onOpenChange(false)
    } catch {
      // The mutation hook already surfaced the error via a toast.
    }
  }

  const name = [student.firstName, student.lastName].filter(Boolean).join(" ")
  const placement = [
    student.class ? student.class.name : null,
    student.section ? `Section ${student.section.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm text-foreground">
        Generate a report card for <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">
          {" "}
          ({student.admissionNumber}
          {placement ? ` · ${placement}` : ""})
        </span>
      </p>

      {!classId && (
        <p className="text-sm text-destructive">
          This student has no placement in the selected session, so a report card cannot be generated.
        </p>
      )}

      {existingQuery.isError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">Could not check existing versions.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void existingQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {blockedByDraft && (
        <Notice>
          An active draft already exists for this student and session (version{" "}
          {preconditions.activeDraftVersion}). Finalize or discard it before generating a new version.
        </Notice>
      )}

      {!blockedByDraft && preconditions.requiresReissueReason && (
        <div className="flex flex-col gap-1.5">
          <Notice>
            This student already has a published version (v{preconditions.latestVersion}). Generating
            creates a new version, so a reissue reason is required.
          </Notice>
          <Label htmlFor="reissue-reason" className="text-xs font-medium text-muted-foreground">
            Reissue reason
          </Label>
          <Textarea
            id="reissue-reason"
            value={reissueReason}
            onChange={(event) => setReissueReason(event.target.value)}
            maxLength={500}
            placeholder="Why is a new version being issued?"
            aria-invalid={reasonMissing}
          />
        </div>
      )}

      {!blockedByDraft && !preconditions.requiresReissueReason && !existingQuery.isError && (
        <p className="text-xs text-muted-foreground">
          {preconditions.latestVersion
            ? `This will create version ${preconditions.latestVersion + 1}.`
            : "This will create version 1."}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitDisabled}>
          {generateMutation.isPending ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <p className="text-sm text-amber-800 dark:text-amber-300/90">{children}</p>
    </div>
  )
}
