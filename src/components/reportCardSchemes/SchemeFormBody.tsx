import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DialogFooter } from "@/components/ui/dialog"
import { CoreSubjectsPicker } from "@/components/reportCardSchemes/CoreSubjectsPicker"
import { SchemeExamsEditor } from "@/components/reportCardSchemes/SchemeExamsEditor"
import { makeSchemeExamRow } from "@/lib/reportCardSchemeFormRules"
import type {
  ReportCardSchemeFormError,
  ReportCardSchemeFormValue,
  SchemeExamFormRow,
} from "@/lib/reportCardSchemeFormRules"
import { CLASS_SCOPE_KEY } from "@/lib/reportCardSchemeScope"
import {
  ABSENCE_POLICY_LABELS,
  ABSENCE_POLICY_OPTIONS,
  AGGREGATION_POLICY_LABELS,
  AGGREGATION_POLICY_OPTIONS,
  OVERALL_PASS_MODE_LABELS,
  OVERALL_PASS_MODE_OPTIONS,
} from "@/types/reportCardScheme"
import type {
  AbsencePolicy,
  AggregationPolicy,
  OverallPassMode,
} from "@/types/reportCardScheme"
import type { AcademicSessionListItem } from "@/types/academicSessions"
import type { ClassListItem } from "@/types/classes"
import type { SectionListItem } from "@/types/sections"
import type { ExamTypeListItem } from "@/types/masterData"
import type { SubjectListItem } from "@/types/subjects"

interface SchemeFormBodyProps {
  value: ReportCardSchemeFormValue
  patch: (p: Partial<ReportCardSchemeFormValue>) => void
  /** When true the scope (session/class/section) is shown read-only and locked. */
  lockScope: boolean
  effectiveSessionId: string
  sessions: AcademicSessionListItem[]
  classes: ClassListItem[]
  sections: SectionListItem[]
  examTypes: ExamTypeListItem[]
  subjects: SubjectListItem[]
  errors: ReportCardSchemeFormError[]
  isSaving: boolean
  saveDisabled: boolean
  onSubmit: (event: React.FormEvent) => void
  submitLabel: string
  onCancel: () => void
}

/**
 * The single editable form for a report card scheme, shared by create and edit.
 * It owns no data fetching: the scope resolver (create) and the detail fetch
 * (edit) live in the dialog, which passes the assembled option lists in.
 */
export function SchemeFormBody({
  value,
  patch,
  lockScope,
  effectiveSessionId,
  sessions,
  classes,
  sections,
  examTypes,
  subjects,
  errors,
  isSaving,
  saveDisabled,
  onSubmit,
  submitLabel,
  onCancel,
}: SchemeFormBodyProps) {
  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message

  const setExamRow = (index: number, rowPatch: Partial<SchemeExamFormRow>) => {
    patch({ exams: value.exams.map((row, i) => (i === index ? { ...row, ...rowPatch } : row)) })
  }
  const addExamRow = () => {
    patch({ exams: [...value.exams, makeSchemeExamRow(crypto.randomUUID())] })
  }
  const removeExamRow = (index: number) => {
    patch({ exams: value.exams.filter((_, i) => i !== index) })
  }
  const toggleCoreSubject = (subjectId: string, selected: boolean) => {
    patch({
      coreSubjectIds: selected
        ? [...value.coreSubjectIds, subjectId]
        : value.coreSubjectIds.filter((id) => id !== subjectId),
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Academic session" required error={errorFor("academicSessionId")}>
          {lockScope ? (
            <Input
              value={sessions.find((session) => session.id === value.academicSessionId)?.name ?? "—"}
              disabled
            />
          ) : (
            <Select
              value={effectiveSessionId}
              onValueChange={(sessionId) => patch({ academicSessionId: sessionId })}
            >
              <SelectTrigger className="w-full" aria-label="Academic session">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.name} ({session.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Class" required error={errorFor("classId")}>
          {lockScope ? (
            <Input value={classes.find((cls) => cls.id === value.classId)?.name ?? "Unknown class"} disabled />
          ) : (
            <Select
              value={value.classId}
              onValueChange={(classId) => patch({ classId, sectionId: "" })}
            >
              <SelectTrigger className="w-full" aria-label="Class">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Scope">
          {lockScope ? (
            <Input
              value={
                value.sectionId === ""
                  ? "Class-level"
                  : `Section ${sections.find((section) => section.id === value.sectionId)?.name ?? ""}`
              }
              disabled
            />
          ) : (
            <Select
              value={value.sectionId === "" ? CLASS_SCOPE_KEY : value.sectionId}
              onValueChange={(section) =>
                patch({ sectionId: section === CLASS_SCOPE_KEY ? "" : section })
              }
              disabled={!value.classId}
            >
              <SelectTrigger className="w-full" aria-label="Scope">
                <SelectValue placeholder="Class-level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CLASS_SCOPE_KEY}>Whole class (class-level)</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    Section {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Aggregation policy" required error={errorFor("aggregationPolicy")}>
          <Select
            value={value.aggregationPolicy}
            onValueChange={(policy) => patch({ aggregationPolicy: policy as AggregationPolicy })}
          >
            <SelectTrigger className="w-full" aria-label="Aggregation policy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGGREGATION_POLICY_OPTIONS.map((policy) => (
                <SelectItem key={policy} value={policy}>
                  {AGGREGATION_POLICY_LABELS[policy]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Absence policy" required error={errorFor("absencePolicy")}>
          <Select
            value={value.absencePolicy}
            onValueChange={(policy) => patch({ absencePolicy: policy as AbsencePolicy })}
          >
            <SelectTrigger className="w-full" aria-label="Absence policy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ABSENCE_POLICY_OPTIONS.map((policy) => (
                <SelectItem key={policy} value={policy}>
                  {ABSENCE_POLICY_LABELS[policy]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Annual subject pass percentage" required error={errorFor("annualSubjectPassPercent")}>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          value={value.annualSubjectPassPercent}
          onChange={(event) => patch({ annualSubjectPassPercent: event.target.value })}
          placeholder="e.g. 40"
          className="sm:max-w-40"
        />
      </Field>

      <Field label="Overall pass mode" required error={errorFor("overallPassMode")}>
        <Select
          value={value.overallPassMode}
          onValueChange={(mode) => patch({ overallPassMode: mode as OverallPassMode })}
        >
          <SelectTrigger className="w-full" aria-label="Overall pass mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OVERALL_PASS_MODE_OPTIONS.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {OVERALL_PASS_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {value.overallPassMode === "PERCENT_AND_MAX_FAILED" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Overall pass percentage" required error={errorFor("overallPassPercent")}>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={value.overallPassPercent}
              onChange={(event) => patch({ overallPassPercent: event.target.value })}
              placeholder="e.g. 35"
            />
          </Field>
          <Field label="Max failed subjects" required error={errorFor("maxFailedSubjects")}>
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={value.maxFailedSubjects}
              onChange={(event) => patch({ maxFailedSubjects: event.target.value })}
              placeholder="e.g. 2"
            />
          </Field>
        </div>
      )}

      {value.overallPassMode === "CORE_SUBJECTS_AND_PERCENT" && (
        <div className="flex flex-col gap-4">
          <Field label="Overall pass percentage" required error={errorFor("overallPassPercent")}>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={value.overallPassPercent}
              onChange={(event) => patch({ overallPassPercent: event.target.value })}
              placeholder="e.g. 35"
              className="sm:max-w-40"
            />
          </Field>
          <Field label="Core subjects" required error={errorFor("coreSubjectIds")}>
            <CoreSubjectsPicker
              subjects={subjects}
              selected={value.coreSubjectIds}
              onToggle={toggleCoreSubject}
            />
          </Field>
        </div>
      )}

      <Field label="Exams" required error={errorFor("exams")}>
        <SchemeExamsEditor
          rows={value.exams}
          examTypes={examTypes}
          showWeight={value.aggregationPolicy === "PERCENTAGE_WEIGHTED"}
          onChangeRow={setExamRow}
          onAddRow={addExamRow}
          onRemoveRow={removeExamRow}
        />
      </Field>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving || saveDisabled}>
          {isSaving ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
