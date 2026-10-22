import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SchemeFormBody } from "@/components/reportCardSchemes/SchemeFormBody"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useClassesOptions, useSections } from "@/hooks/useSections"
import { useExamTypes } from "@/hooks/useMasterData"
import { useSubjects } from "@/hooks/useSubjects"
import {
  useReportCardScheme,
  useReportCardSchemes,
  useUpsertReportCardScheme,
} from "@/hooks/useReportCardSchemes"
import {
  defaultReportCardSchemeForm,
  reportCardSchemeFormToPayload,
  schemeDetailToFormValue,
  validateReportCardSchemeForm,
} from "@/lib/reportCardSchemeFormRules"
import type {
  ReportCardSchemeFormError,
  ReportCardSchemeFormValue,
} from "@/lib/reportCardSchemeFormRules"
import {
  buildSchemeScopeNames,
  describeSchemeScope,
  findSchemeForScope,
} from "@/lib/reportCardSchemeScope"
import type { ReportCardSchemeDetail } from "@/types/reportCardScheme"

interface ReportCardSchemeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ReportCardSchemeDetail | null
  defaultSessionId: string
  defaultClassId: string
  onEditExisting: (scheme: ReportCardSchemeDetail) => void
}

export function ReportCardSchemeFormDialog({
  open,
  onOpenChange,
  editing,
  defaultSessionId,
  defaultClassId,
  onEditExisting,
}: ReportCardSchemeFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit report card scheme" : "New report card scheme"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update how this scope aggregates marks and decides an overall pass."
              : "Configure how a class or section aggregates marks and decides an overall pass for a session."}
          </DialogDescription>
        </DialogHeader>
        {open &&
          (editing ? (
            <EditSchemeContent key={editing.id} schemeId={editing.id} onOpenChange={onOpenChange} />
          ) : (
            <CreateSchemeContent
              key="new"
              defaultSessionId={defaultSessionId}
              defaultClassId={defaultClassId}
              onOpenChange={onOpenChange}
              onEditExisting={onEditExisting}
            />
          ))}
      </DialogContent>
    </Dialog>
  )
}

function CreateSchemeContent({
  defaultSessionId,
  defaultClassId,
  onOpenChange,
  onEditExisting,
}: {
  defaultSessionId: string
  defaultClassId: string
  onOpenChange: (open: boolean) => void
  onEditExisting: (scheme: ReportCardSchemeDetail) => void
}) {
  const sessions = useAcademicSessions({}).data?.items ?? []
  const classes = useClassesOptions().data?.items ?? []
  const examTypes = useExamTypes({}).data?.items ?? []
  const subjects = useSubjects({}).data?.items ?? []

  const [form, setForm] = useState<ReportCardSchemeFormValue>(() =>
    defaultReportCardSchemeForm({ academicSessionId: defaultSessionId, classId: defaultClassId }),
  )
  const [errors, setErrors] = useState<ReportCardSchemeFormError[]>([])

  const sections = useSections({ classId: form.classId || undefined }).data?.items ?? []
  const scopeNames = buildSchemeScopeNames(classes, sections)

  const fallbackSessionId =
    sessions.find((session) => session.status === "ACTIVE")?.id ?? sessions[0]?.id ?? ""
  const effectiveSessionId = form.academicSessionId || defaultSessionId || fallbackSessionId

  const resolverQuery = useReportCardSchemes(
    useMemo(
      () => ({
        academicSessionId: effectiveSessionId || undefined,
        classId: form.classId || undefined,
      }),
      [effectiveSessionId, form.classId],
    ),
  )
  const { refetch, isPending, isFetching, isError } = resolverQuery

  // Revalidate the scope whenever it changes so a scheme created by another
  // actor is not missed from a still-fresh cache entry.
  useEffect(() => {
    if (effectiveSessionId && form.classId) void refetch()
  }, [effectiveSessionId, form.classId, refetch])

  const scope = {
    academicSessionId: effectiveSessionId,
    classId: form.classId,
    sectionId: form.sectionId === "" ? null : form.sectionId,
  }
  const existing =
    effectiveSessionId && form.classId
      ? findSchemeForScope(resolverQuery.data?.items ?? [], scope)
      : undefined

  const upsertMutation = useUpsertReportCardScheme()
  const [isVerifying, setIsVerifying] = useState(false)
  const isSaving = upsertMutation.isPending || isVerifying
  const scopeUnresolved = Boolean(form.classId) && (isPending || isFetching || isError)

  const patch = (p: Partial<ReportCardSchemeFormValue>) =>
    setForm((previous) => ({ ...previous, ...p }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value: ReportCardSchemeFormValue = { ...form, academicSessionId: effectiveSessionId }
    const validationErrors = validateReportCardSchemeForm(value)
    setErrors(validationErrors)
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0].message)
      return
    }

    setIsVerifying(true)
    try {
      const result = await refetch()
      if (result.isError || !result.data) {
        toast.error("Could not verify the selected scope. Check your connection and try again.")
        return
      }
      if (findSchemeForScope(result.data.items, scope)) {
        toast.error("A scheme already exists for this scope.")
        return
      }
      await upsertMutation.mutateAsync(reportCardSchemeFormToPayload(value))
      onOpenChange(false)
    } catch {
      // The mutation hook already surfaced the error via a toast.
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <>
      {existing && (
        <ExistingSchemeNotice
          scope={describeSchemeScope(
            { classId: form.classId, sectionId: form.sectionId === "" ? null : form.sectionId },
            scopeNames,
          )}
          onEdit={() => onEditExisting(existing)}
        />
      )}
      {!existing && form.classId && scopeUnresolved && (
        <p className="text-xs text-muted-foreground">Checking for an existing scheme…</p>
      )}
      {!existing && form.classId && isError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">Could not check for an existing scheme.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      <SchemeFormBody
        value={form}
        patch={patch}
        lockScope={false}
        effectiveSessionId={effectiveSessionId}
        sessions={sessions}
        classes={classes}
        sections={sections}
        examTypes={examTypes}
        subjects={subjects}
        errors={errors}
        isSaving={isSaving}
        saveDisabled={scopeUnresolved || Boolean(existing)}
        onSubmit={handleSubmit}
        submitLabel="Create scheme"
        onCancel={() => onOpenChange(false)}
      />
    </>
  )
}

function EditSchemeContent({
  schemeId,
  onOpenChange,
}: {
  schemeId: string
  onOpenChange: (open: boolean) => void
}) {
  const detailQuery = useReportCardScheme(schemeId)

  if (detailQuery.isPending) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading scheme…</p>
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-muted-foreground">Could not load this scheme.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  return <EditSchemeEditor detail={detailQuery.data} onOpenChange={onOpenChange} />
}

function EditSchemeEditor({
  detail,
  onOpenChange,
}: {
  detail: ReportCardSchemeDetail
  onOpenChange: (open: boolean) => void
}) {
  const sessions = useAcademicSessions({}).data?.items ?? []
  const classes = useClassesOptions().data?.items ?? []
  const sections = useSections({ classId: detail.classId }).data?.items ?? []
  // Inactive exam types are listed so an already-bound one stays visible; the
  // editor disables the ones that are not already bound.
  const examTypes = useExamTypes({ includeInactive: true }).data?.items ?? []
  const subjects = useSubjects({}).data?.items ?? []

  const [form, setForm] = useState<ReportCardSchemeFormValue>(() => schemeDetailToFormValue(detail))
  const [errors, setErrors] = useState<ReportCardSchemeFormError[]>([])
  const upsertMutation = useUpsertReportCardScheme()

  const patch = (p: Partial<ReportCardSchemeFormValue>) =>
    setForm((previous) => ({ ...previous, ...p }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value: ReportCardSchemeFormValue = { ...form, academicSessionId: detail.academicSessionId }
    const validationErrors = validateReportCardSchemeForm(value)
    setErrors(validationErrors)
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0].message)
      return
    }
    try {
      await upsertMutation.mutateAsync(reportCardSchemeFormToPayload(value))
      onOpenChange(false)
    } catch {
      // The mutation hook already surfaced the error via a toast.
    }
  }

  return (
    <SchemeFormBody
      value={form}
      patch={patch}
      lockScope
      effectiveSessionId={detail.academicSessionId}
      sessions={sessions}
      classes={classes}
      sections={sections}
      examTypes={examTypes}
      subjects={subjects}
      errors={errors}
      isSaving={upsertMutation.isPending}
      saveDisabled={false}
      onSubmit={handleSubmit}
      submitLabel="Save changes"
      onCancel={() => onOpenChange(false)}
    />
  )
}

function ExistingSchemeNotice({ scope, onEdit }: { scope: string; onEdit: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            A scheme already exists for this scope
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300/90">
            {scope} already has a configured scheme. Schemes are unique per class or section, so edit
            the existing scheme instead of creating a duplicate.
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={onEdit}>
        Edit existing scheme
      </Button>
    </div>
  )
}

